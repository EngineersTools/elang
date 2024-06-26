import {
  AstNode,
  AstNodeDescription,
  AstUtils,
  DefaultScopeComputation,
  DefaultScopeProvider,
  EMPTY_SCOPE,
  LangiumDocument,
  LangiumDocuments,
  MapScope,
  MultiMap,
  PrecomputedScopes,
  ReferenceInfo,
  Scope,
  ScopeOptions,
  StreamScope,
  URI,
  UriUtils,
  interruptAndCheck,
  stream,
} from "langium";
import { LangiumServices } from "langium/lsp";
import { CancellationToken } from "vscode-jsonrpc";
import { getQualifiedName } from "../interpreter/AstNode.utils.js";
import {
  ElangProgram,
  Import,
  isConstantDeclaration,
  isElangProgram,
  isExportable,
  isModelMemberAssignment,
  isModelMemberCall,
  isModelValue,
  isMutableDeclaration,
  isUnitDeclaration,
} from "./generated/ast.js";
import { TypeEnvironment } from "./type-system/TypeEnvironment.class.js";
import { ModelMemberType, isModelType } from "./type-system/descriptions.js";
import { inferType } from "./type-system/infer.js";

export class ElangScopeProvider extends DefaultScopeProvider {
  constructor(services: LangiumServices) {
    super(services);
    this.langiumDocuments = services.shared.workspace.LangiumDocuments;
    this.types = new TypeEnvironment();
  }

  protected readonly types: TypeEnvironment;
  protected readonly langiumDocuments: LangiumDocuments;

  protected override getGlobalScope(
    referenceType: string,
    context: ReferenceInfo
  ): Scope {
    const elangProgram = getContainerOfType(context.container, isElangProgram);

    if (!elangProgram) {
      return EMPTY_SCOPE;
    }

    const importedUris = new Set<string>();

    this.gatherImports(elangProgram, importedUris);

    let importedElements = this.indexManager.allElements(
      referenceType,
      importedUris
    );

    return new MapScope(importedElements);
  }

  override getScope(context: ReferenceInfo): Scope {
    if (
      context.property === "element" &&
      isModelMemberCall(context.container)
    ) {
      const memberCall = context.container;
      const previous = memberCall.previous;

      if (!previous) {
        return super.getScope(context);
      }

      const previousType = inferType(previous, this.types);

      if (isModelType(previousType)) {
        return previousType !== undefined && previousType.$source === "value"
          ? this.scopeMemberTypes(previousType.memberTypes)
          : super.getScope(context);
      }
      return EMPTY_SCOPE;
    }

    return super.getScope(context);
  }

  private scopeMemberTypes(memberTypes: ModelMemberType[]): Scope {
    const allMembers = memberTypes.flatMap((e) => e.typeDesc);
    return this.createScopeForNodes(allMembers);
  }

  override createScopeForNodes(
    elements: Iterable<AstNode>,
    outerScope?: Scope | undefined,
    options?: ScopeOptions | undefined
  ): Scope {
    const s = stream(elements)
      .map((e) => {
        const name = isModelMemberAssignment(e)
          ? e.property
          : this.nameProvider.getName(e);

        if (name) {
          return this.descriptions.createDescription(e, name);
        }

        return undefined;
      })
      .nonNullable();

    return new StreamScope(s, outerScope, options);
  }

  private gatherImports(
    elangProgram: ElangProgram,
    importedUris: Set<string>
  ): void {
    for (const imp0rt of elangProgram.imports) {
      const uri = resolveImportUri(imp0rt);
      if (uri && !importedUris.has(uri.toString())) {
        importedUris.add(uri.toString());
        const importedDocument = this.langiumDocuments.getDocument(uri);
        if (importedDocument) {
          const rootNode = importedDocument.parseResult.value;
          if (isElangProgram(rootNode)) {
            this.gatherImports(rootNode, importedUris);
          }
        }
      }
    }
  }
}

export class ElangScopeComputation extends DefaultScopeComputation {
  constructor(services: LangiumServices) {
    super(services);
  }

  protected override exportNode(
    node: AstNode,
    exports: AstNodeDescription[],
    document: LangiumDocument
  ): void {
    // this function is called in order to export nodes to the GLOBAL scope
    if (isExportable(node) && node.export === true) {
      super.exportNode(node, exports, document);
    }
  }

  override async computeLocalScopes(
    document: LangiumDocument,
    cancelToken = CancellationToken.None
  ): Promise<PrecomputedScopes> {
    const scopes = new MultiMap<AstNode, AstNodeDescription>();

    for (const node of AstUtils.streamAllContents(
      document.parseResult.value as ElangProgram
    )) {
      await interruptAndCheck(cancelToken);

      if (isConstantDeclaration(node) || isMutableDeclaration(node)) {
        if (node.assignment && isModelValue(node.value)) {
          node.value.members.forEach((m) => {
            const fullyQualifiedName = getQualifiedName(node, m.property); // `${node.name}.${m.property}`;

            scopes.add(
              node.$container,
              this.descriptions.createDescription(
                node,
                fullyQualifiedName,
                document
              )
            );
          });
        }
        this.processNode(node, document, scopes);
      } else if (isUnitDeclaration(node)) {
        scopes.add(
          document.parseResult.value,
          this.descriptions.createDescription(node, node.name, document)
        );
      } else {
        this.processNode(node, document, scopes);
      }
    }

    return scopes;
  }
}

/**
 * Walk along the hierarchy of containers from the given AST node to the root and return the first
 * node that matches the type predicate. If the start node itself matches, it is returned.
 * If no container matches, `undefined` is returned.
 */
export function getContainerOfType<T extends AstNode>(
  node: AstNode | undefined,
  typePredicate: (n: AstNode) => n is T
): T | undefined {
  let item = node;
  while (item) {
    if (typePredicate(item)) {
      return item;
    }
    item = item.$container;
  }
  return undefined;
}

export function resolveImportUri(imp: Import): URI | undefined {
  if (imp.importSource === undefined || imp.importSource.length === 0) {
    return undefined;
  }
  const dirUri = UriUtils.dirname(getDocument(imp).uri);
  let importPath = imp.importSource;
  if (!importPath.endsWith(".el")) {
    importPath += ".el";
  }
  return UriUtils.resolvePath(dirUri, importPath);
}

/**
 * Retrieve the document in which the given AST node is contained. A reference to the document is
 * usually held by the root node of the AST.
 *
 * @throws an error if the node is not contained in a document.
 */
export function getDocument<T extends AstNode = AstNode>(
  node: AstNode
): LangiumDocument<T> {
  const rootNode = findRootNode(node);
  const result = rootNode.$document;
  if (!result) {
    throw new Error("AST node has no document.");
  }
  return result as LangiumDocument<T>;
}

/**
 * Returns the root node of the given AST node by following the `$container` references.
 */
export function findRootNode(node: AstNode): AstNode {
  while (node.$container) {
    node = node.$container;
  }
  return node;
}
