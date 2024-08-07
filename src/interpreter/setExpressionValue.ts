import {
  Expression,
  isConstantDeclaration,
  isExpression,
  isListValue,
  isModelMemberAssignment,
  isModelMemberCall,
  isModelValue,
  isMutableDeclaration,
  isParameterDeclaration,
  isPropertyDeclaration,
  ModelMemberAssignment,
} from "../language/generated/ast.js";
import { AstNodeError } from "./AstNodeError.js";
import { RunnerContext } from "./RunnerContext.js";
import { runExpression } from "./runExpression.js";

/**
 * Stores the value of an expression evaluation on the context
 * variables object
 * @param left the left term of the expression
 * @param right the right term of the expression
 * @param context the context in which this expression is evaluated
 * @returns A promise with the evaluation result
 */
export async function setExpressionValue(
  left: Expression,
  right: Expression,
  context: RunnerContext
): Promise<unknown> {
  if (isModelMemberCall(left)) {
    if (left.explicitOperationCall) {
      throw new AstNodeError(
        left,
        "Cannot assign values to formula or procedure calls"
      );
    }

    let previous: unknown = undefined;
    if (left.previous) {
      previous = await runExpression(left.previous, context);
    }

    const ref = left.element?.ref;
    const name = isModelMemberAssignment(ref)
      ? (ref as ModelMemberAssignment).property
      : ref?.name;

    if (!name) {
      throw new AstNodeError(
        left,
        `Cannot resolve name to element '${left.element.$refText}'`
      );
    }

    if (isConstantDeclaration(ref)) {
      throw new AstNodeError(
        left,
        `Cannot re-assign values to constant '${ref.name}'`
      );
    }

    if (isPropertyDeclaration(ref) && isModelValue(previous)) {
      const member = previous.members.find((m) => m.property == ref.name);

      if (member) {
        member.value = right;
      }
    } else if (isModelMemberAssignment(ref) && isModelValue(previous)) {
      const member = previous.members.find(
        (m) => m.property == (ref as ModelMemberAssignment).property
      );

      if (member) {
        member.value = right;
      }
    } else if (
      isPropertyDeclaration(ref) &&
      isModelMemberAssignment(previous) &&
      isModelValue(previous.value)
    ) {
      const member = previous.value.members.find((m) => m.property == ref.name);
      if (member) {
        member.value = right;
      }
    } else if (
      isModelMemberAssignment(ref) &&
      isModelMemberAssignment(previous) &&
      isModelValue(previous.value)
    ) {
      const member = previous.value.members.find(
        (m) => m.property == (ref as ModelMemberAssignment).property
      );
      if (member) {
        member.value = right;
      }
    } else if (isMutableDeclaration(ref)) {
      if (
        left.accessElement &&
        left.index !== undefined &&
        isListValue(ref.value)
      ) {
        const index = isExpression(left.index)
          ? await runExpression(left.index, context)
          : left.index;

        if (
          typeof index === "number" &&
          index > 0
        ) {
          ref.value.items[index - 1] = right;
          context.variables.set(left, name, ref.value);
        } else {
          throw new AstNodeError(
            left,
            `Index '${index}' out of range for list '${name}`
          );
        }
      } else {
        const rightValue = await runExpression(right, context);
        context.variables.set(left, name, rightValue);
      }
    } else if (isParameterDeclaration(ref)) {
      context.variables.set(left, name, right);
    }
  }

  const rightValue = await runExpression(right, context);

  return rightValue;
}
