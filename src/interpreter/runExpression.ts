import { interruptAndCheck } from "langium";
import {
  Expression,
  MeasurementLiteral,
  isBinaryExpression,
  isBooleanLiteral,
  isExpression,
  isListAdd,
  isListCount,
  isListRemove,
  isListValue,
  isMathematicalFunction,
  isMeasurementLiteral,
  isModelMemberAssignment,
  isModelMemberCall,
  isModelValue,
  isNullLiteral,
  isNumberLiteral,
  isStringLiteral,
  isUnaryExpression,
  isUnitConversionExpression,
} from "../language/generated/ast.js";
import { AstNodeError } from "./AstNodeError.js";
import { runMathFunction } from "./Math.functions.js";
import { RunnerContext } from "./RunnerContext.js";
import { convertMeasurements } from "./convertMeasurements.js";
import { runBinaryExpression } from "./runBinaryExpression.js";
import { runMemberCall } from "./runMemberCall.js";
import { isMeasurement, isNumber } from "./runProgram.js";

/**
 * Runs an individual ELang expression returning the evaluated value
 * @param expression An ELang expression that returns a value
 * @param context The context in which this expression is running
 */

export async function runExpression(
  expression: Expression,
  context: RunnerContext
): Promise<unknown> {
  // Check if the program needs to be interrupted before
  // processing this expression
  await interruptAndCheck(context.cancellationToken);

  // Check for all possible types of expression and return
  // their evaluated value
  if (expression === undefined) {
    return null;
  } else if (isMathematicalFunction(expression)) {
    return await runMathFunction(expression, context);
  } else if (isNumberLiteral(expression)) {
    return expression.value;
  } else if (isBooleanLiteral(expression)) {
    return expression.value;
  } else if (isNullLiteral(expression)) {
    return null;
  } else if (isStringLiteral(expression)) {
    return expression.value;
  } else if (isModelValue(expression)) {
    return expression;
  } else if (isListValue(expression)) {
    return expression;
  } else if (isModelMemberAssignment(expression)) {
    if (isExpression(expression.value))
      return await runExpression(expression.value, context);
    else return expression.value;
  } else if (isModelMemberCall(expression)) {
    return await runMemberCall(expression, context);
  } else if (isBinaryExpression(expression)) {
    return await runBinaryExpression(expression, context);
  } else if (isUnaryExpression(expression)) {
    const { operator, value } = expression;

    let actualValue: unknown = value;

    while (isExpression(actualValue) && !isMeasurement(actualValue)) {
      if (isModelMemberCall(actualValue)) {
        actualValue = await runMemberCall(actualValue, context);
      } else {
        actualValue = await runExpression(actualValue, context);
      }
    }

    if (operator === "-") {
      if (typeof actualValue === "number") {
        return -actualValue;
      } else if (isMeasurement(actualValue)) {
        return {
          ...actualValue,
          value: -actualValue.value,
        } as MeasurementLiteral;
      } else {
        throw new AstNodeError(
          expression,
          `Cannot apply operator '${operator}' to value of type '${typeof actualValue}'`
        );
      }
    } else if (operator === "!") {
      if (typeof actualValue === "boolean") {
        return !actualValue;
      } else {
        throw new AstNodeError(
          expression,
          `Cannot apply operator '${operator}' to value of type '${typeof actualValue}'`
        );
      }
    }
  } else if (isMeasurementLiteral(expression)) {
    return expression;
  } else if (
    isUnitConversionExpression(expression) &&
    expression.left &&
    expression.unit
  ) {
    const leftValue = await runExpression(expression.left, context);

    if (isMeasurement(leftValue)) {
      const converted = await convertMeasurements(
        leftValue,
        { ...leftValue, unit: expression.unit },
        context,
        expression.arguments
      );

      return converted.left;
    } else if (
      isModelMemberAssignment(leftValue) &&
      isMeasurement(leftValue.value)
    ) {
      const converted = await convertMeasurements(
        leftValue.value,
        { ...leftValue.value, unit: expression.unit },
        context,
        expression.arguments
      );

      return converted.left;
    } else {
      throw new AstNodeError(
        expression,
        "Unit conversion cannot be applied to this expression " +
          expression.left.$type
      );
    }
  } else if (isListCount(expression)) {
    const list = await runExpression(expression.list, context);
    if (isListValue(list)) {
      return list.items.length;
    } else {
      throw new AstNodeError(
        expression,
        `Cannot get the count of elements in list '${expression.list.$cstNode?.text}'`
      );
    }
  } else if (isListAdd(expression)) {
    const list = await runExpression(expression.list, context);
    if (isListValue(list) && expression.item) {
      const newList = { ...list, items: [...list.items] };
      newList.items.push(expression.item);
      return newList;
    } else {
      throw new AstNodeError(
        expression,
        `Cannot add element to list '${expression.list.$cstNode?.text}'`
      );
    }
  } else if (isListRemove(expression)) {
    const list = await runExpression(expression.list, context);
    if (isListValue(list)) {
      const newList = { ...list, items: [...list.items] };
      if (isExpression(expression.index)) {
        const evaluatedIndex = await runExpression(expression.index, context);
        newList.items.splice((evaluatedIndex as number) - 1, 1);
      } else if (isNumber(expression.index)) {
        newList.items.splice(expression.index - 1, 1);
      } else {
        newList.items.pop();
      }
      return newList;
    } else {
      throw new AstNodeError(
        expression,
        `Cannot remove element from list '${expression.list.$cstNode?.text}'`
      );
    }
  }

  // If the expression hasn't been captured by now, it is an
  // invalid expression. Throw a new error to let the context know
  throw new AstNodeError(
    expression,
    "Unknown expression type found " + expression.$type
  );
}
