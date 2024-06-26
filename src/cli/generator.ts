import * as path from "node:path";
import type { ModelDeclaration } from "../language/generated/ast.js";
import { extractDestinationAndName } from "./cli-util.js";

export function generateJavaScript(
  model: ModelDeclaration,
  filePath: string,
  destination: string | undefined
): string {
  const data = extractDestinationAndName(filePath, destination);
  const generatedFilePath = `${path.join(data.destination, data.name)}.js`;

  // const fileNode = new CompositeGeneratorNode();
  // fileNode.append('"use strict";', NL, NL);
  // model.greetings.forEach(greeting => fileNode.append(`console.log('Hello, ${greeting.person.ref?.name}!');`, NL));

  // if (!fs.existsSync(data.destination)) {
  //     fs.mkdirSync(data.destination, { recursive: true });
  // }
  // fs.writeFileSync(generatedFilePath, toString(fileNode));
  return generatedFilePath;
}
