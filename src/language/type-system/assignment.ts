import {
  ParameterType,
  TypeDescription,
  isFormulaType,
  isListType,
  isModelMemberType,
  isModelType,
  isNullType,
  isUnionType,
} from "./descriptions.js";

export type IsAssignableResult =
  | {
      result: true;
    }
  | {
      result: false;
      reason: string;
      typeDesc: TypeDescription;
    };

export function isAssignable(
  from: TypeDescription,
  to: TypeDescription
): IsAssignableResult {
  if (isModelType(from) && isModelType(to)) {
    if (from.$source === "declaration") {
      const messages: string[] = [];

      const result = from.memberTypes.every((member) => {
        const toMember = to.memberTypes.find((m) => m.name === member.name);
        if (!toMember) {
          return member.optional ?? false;
        }

        const result = isAssignable(member, toMember);

        if (!result.result) {
          messages.push(result.reason);
        }

        return result.result;
      });

      return result
        ? createAssignableResult()
        : createNonAssignableResult(from, to, messages.join("\n"));
    }
  } else if (isModelMemberType(from) && isModelMemberType(to)) {
    return from.$type === to.$type &&
      isAssignable(from.typeDesc, to.typeDesc).result
      ? createAssignableResult()
      : createNonAssignableResult(
          from,
          to,
          `Type mismatch on property ${from.name}: '${to.typeDesc.$type}' is not assignable to '${from.typeDesc.$type}'`
        );
  } else if (isNullType(from)) {
    return isModelType(to)
      ? createAssignableResult()
      : createNonAssignableResult(from, to);
  } else if (isFormulaType(from)) {
    if (!isFormulaType(to)) {
      return createNonAssignableResult(from, to);
    } else if (!isAssignable(from.returnType, to.returnType).result) {
      return createNonAssignableResult(from, to);
    } else if (
      from.parameterTypes &&
      to.parameterTypes &&
      from.parameterTypes.length !== to.parameterTypes.length
    ) {
      return createNonAssignableResult(from, to);
    } else if (from.parameterTypes && to.parameterTypes) {
      const messages: string[] = [];

      const result = from.parameterTypes.every((param, i) => {
        const result = isAssignable(
          param,
          (to.parameterTypes as ParameterType[])[i]
        );

        if (!result.result) {
          messages.push(result.reason);
        }

        return result.result;
      });

      return result
        ? createAssignableResult()
        : createNonAssignableResult(from, to, messages.join("\n"));
    }
  } else if (isListType(from) && isListType(to)) {
    const isAssignableResult = isAssignable(from.itemType, to.itemType);

    if (from.$type === to.$type && isAssignableResult.result) {
      return createAssignableResult();
    } else if (!isAssignableResult.result) {
      return createNonAssignableResult(
        from,
        to,
        isAssignableResult.reason ??
          `Type mismatch: '${from.itemType.$type}' is not assignable to '${to.itemType.$type}'`
      );
    }
  } else if (isUnionType(to)) {
    if (isUnionType(from)) {
      const allToIncluded = to.types
        .map((t) => t.$type)
        .every((t) => from.types.map((t) => t.$type).includes(t));
      const allFromIncluded = from.types
        .map((t) => t.$type)
        .every((t) => to.types.map((t) => t.$type).includes(t));

      return allFromIncluded && allToIncluded
        ? createAssignableResult()
        : createNonAssignableResult(
            from,
            to,
            `Type mismatch: '${from.types
              .map((t) => t.$type)
              .join(", ")}' is not assignable to '${to.types
              .map((t) => t.$type)
              .join(", ")}'`
          );
    } else {
      const someIncluded = to.types.some((t) => t.$type === from.$type);
      return someIncluded
        ? createAssignableResult()
        : createNonAssignableResult(
            from,
            to,
            `Type mismatch: '${from.$type}' is not assignable to '${to.types
              .map((t) => t.$type)
              .join(", ")}'`
          );
    }
  } else if (isUnionType(from)) {
    const someIncluded = from.types.some((t) => t.$type === from.$type);
    return someIncluded
      ? createAssignableResult()
      : createNonAssignableResult(
          from,
          to,
          `Type mismatch: '${from.types
            .map((t) => t.$type)
            .join(", ")}' is not assignable to '${to.$type}'`
        );
  }

  return from.$type === to.$type
    ? createAssignableResult()
    : createNonAssignableResult(from, to);
}

function createAssignableResult(): IsAssignableResult {
  return { result: true };
}

function createNonAssignableResult(
  from: TypeDescription,
  to: TypeDescription,
  reason?: string
): IsAssignableResult {
  return {
    result: false,
    reason:
      reason ??
      `Type mismatch: '${from.$type}' is not assignable to '${to.$type}'`,
    typeDesc: to,
  };
}
