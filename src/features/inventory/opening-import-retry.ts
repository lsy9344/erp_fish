const PRODUCT_IDENTITY_FIELDS = ["name", "category", "spec"] as const;
const PRODUCT_IDENTITY_CONSTRAINT = "Product_name_category_spec_key";

type PrismaErrorLike = {
  code?: unknown;
  meta?: {
    modelName?: unknown;
    target?: unknown;
  };
};

export function isProductIdentityUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const prismaError = error as PrismaErrorLike;
  if (prismaError.code !== "P2002") {
    return false;
  }

  const { modelName, target } = prismaError.meta ?? {};
  if (modelName !== undefined && modelName !== "Product") {
    return false;
  }

  if (typeof target === "string") {
    return target === PRODUCT_IDENTITY_CONSTRAINT;
  }

  return (
    Array.isArray(target) &&
    target.length === PRODUCT_IDENTITY_FIELDS.length &&
    PRODUCT_IDENTITY_FIELDS.every((field, index) => target[index] === field)
  );
}

export async function retryInventoryProductIdentityTransaction<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isProductIdentityUniqueConstraintError(error)) {
      throw error;
    }
  }

  return operation();
}
