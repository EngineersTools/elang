import { interruptAndCheck } from "langium";
import {
  ModelMemberCall,
  isExpression,
  isFormulaDeclaration,
  isLambdaDeclaration,
  isListValue,
  isModelMemberAssignment,
  isModelValue,
  isProcedureDeclaration,
  isPropertyDeclaration,
} from "../language/generated/ast.js";
import { AstNodeError } from "./AstNodeError.js";
import { RunnerContext } from "./RunnerContext.js";
import { runExpression } from "./runExpression.js";
import { ReturnFunction, runElangStatement } from "./runElangStatement.js";

export async function runMemberCall(
  memberCall: ModelMemberCall,
  context: RunnerContext
): Promise<unknown> {
  await interruptAndCheck(context.cancellationToken);

  let previous: unknown = undefined;

  if (memberCall.previous) {
    previous = await runExpression(memberCall.previous, context);
  }

  const ref = memberCall.element?.ref;
  let value: unknown;

  if (
    (isPropertyDeclaration(ref) || isModelMemberAssignment(ref)) &&
    isModelValue(previous)
  ) {
    const member = isModelMemberAssignment(ref)
      ? previous.members.find((m) => m == ref)
      : previous.members.find((m) => m.property == ref.name);

    if (member) {
      value = await runExpression(member.value, context);
    } else {
      value = null;
    }
  } else if (ref) {
    value = context.variables.get(memberCall, ref.name);
  }

  if (
    memberCall.accessElement == true &&
    memberCall.index !== undefined &&
    ref !== undefined
  ) {
    let index = 0;

    if (isExpression(memberCall.index)) {
      index = (await runExpression(memberCall.index, context)) as number;
    } else {
      index = memberCall.index;
    }

    const value = context.variables.get(ref, ref.name);
    if (isListValue(value) && index < value.items.length && index >= 0) {
      return await runExpression(value.items[index], context);
    } else {
      throw new AstNodeError(
        memberCall,
        `Index out of range. The list '${memberCall.element.$refText}' has less than ${memberCall.index} elements`
      );
    }
  }

  if (memberCall.explicitOperationCall) {
    if (
      isFormulaDeclaration(ref) ||
      isProcedureDeclaration(ref) ||
      isLambdaDeclaration(ref)
    ) {
      const args = await Promise.all(
        memberCall.arguments.map((e) => runExpression(e, context))
      );
      context.variables.enter();
      const names = ref.parameters.map((e) => e.name);
      for (let i = 0; i < args.length; i++) {
        context.variables.push(names[i], args[i]);
      }
      let functionValue: unknown;
      const returnFn: ReturnFunction = (returnValue) => {
        functionValue = returnValue;
      };
      await runElangStatement(ref.body, context, returnFn);
      context.variables.leave();
      return functionValue;
    } else if (isFormulaDeclaration(value) || isLambdaDeclaration(value)) {
      const args = await Promise.all(
        memberCall.arguments.map((e) => runExpression(e, context))
      );
      context.variables.enter();
      const names = value.parameters.map((e) => e.name);
      for (let i = 0; i < args.length; i++) {
        context.variables.push(names[i], args[i]);
      }
      let functionValue: unknown;
      const returnFn: ReturnFunction = (returnValue) => {
        functionValue = returnValue;
      };
      await runElangStatement(value.body, context, returnFn);
      context.variables.leave();
      return functionValue;
    } else {
      throw new AstNodeError(
        memberCall,
        "Cannot call an expression that is not a formula, a procedure or a lambda."
      );
    }
  }

  if (value == undefined) {
    throw new AstNodeError(
      memberCall,
      `Variable ${memberCall.element.$refText} not found.`
    );
  }

  return value;
}
