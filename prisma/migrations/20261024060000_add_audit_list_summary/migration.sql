-- Nullable for old records. No audit backfill or original payload rewrite.
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "listSummary" JSONB;

-- Keep v1 key sets aligned with list-summary.ts and sensitive-fields.ts.
CREATE OR REPLACE FUNCTION audit_list_redacted_v1(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $body$
DECLARE result jsonb;
BEGIN
  IF payload IS NULL THEN RETURN 'null'::jsonb; END IF;
  IF jsonb_typeof(payload) = 'array' THEN
    SELECT COALESCE(jsonb_agg(audit_list_redacted_v1(e.value) ORDER BY e.ord), '[]'::jsonb)
      INTO result FROM jsonb_array_elements(payload) WITH ORDINALITY e(value, ord);
    RETURN result;
  ELSIF jsonb_typeof(payload) = 'object' THEN
    SELECT COALESCE(jsonb_object_agg(e.key, audit_list_redacted_v1(e.value)), '{}'::jsonb)
      INTO result FROM jsonb_each(payload) e
     WHERE NOT EXISTS (
       SELECT 1 FROM unnest(ARRAY['costOfGoodsSold', 'fifoCostOfGoodsSold', 'fifoInventoryAmount', 'grossProfit', 'grossMarginRate', 'hopedSalePriceLossAmount', 'operatingProfit', 'productivity', 'inventoryAmount', 'salesDifference', 'salesDifferenceMeaningChange', 'salesDifferenceThresholdAnomaly', 'storeManagerSensitiveDerivedMetrics', '30%단가', '30단가', 'thirtyPercent', 'thirtyPercentUnitPrice', 'price30', 'margin30', 'unitPrice', 'beforeAmount', 'afterAmount', 'differenceAmount', 'amountDifference', 'marginRate', 'lot', 'fixedCost', 'comparisonStore', 'comparisonStoreValue']::text[]) AS k(value)
        WHERE CASE WHEN length(k.value) <= 3 THEN
          lower(k.value) = ANY(regexp_split_to_array(
            lower(regexp_replace(e.key, '([a-z0-9])([A-Z])', '\1 \2', 'g')), '[^a-z0-9가-힣]+'))
        ELSE position(lower(k.value) in lower(e.key)) > 0 OR
          position(regexp_replace(lower(k.value), '[^a-z0-9가-힣]+', '', 'g') in
                   regexp_replace(lower(e.key), '[^a-z0-9가-힣]+', '', 'g')) > 0
        END
     );
    RETURN result;
  END IF;
  RETURN payload;
END;
$body$;

CREATE OR REPLACE FUNCTION audit_list_snapshot_v1(payload jsonb, summary_object boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $body$
DECLARE result jsonb;
BEGIN
  IF payload IS NULL THEN RETURN 'null'::jsonb; END IF;
  IF jsonb_typeof(payload) = 'array' THEN
    SELECT COALESCE(jsonb_agg(audit_list_snapshot_v1(e.value, false) ORDER BY e.ord), '[]'::jsonb)
      INTO result FROM jsonb_array_elements(payload) WITH ORDINALITY e(value, ord);
    RETURN result;
  ELSIF jsonb_typeof(payload) = 'object' THEN
    SELECT COALESCE(jsonb_object_agg(e.key,
             audit_list_snapshot_v1(e.value, summary_object AND jsonb_typeof(e.value) = 'object')), '{}'::jsonb)
      INTO result FROM jsonb_each(payload) e
     WHERE e.key = ANY(CASE WHEN summary_object THEN ARRAY['amount', 'category', 'codeName', 'displayOrder', 'email', 'isActive', 'name', 'productName', 'quantity', 'reportMarginGapThresholdBps', 'role', 'scope', 'storeName', 'targetName', 'threshold', 'thresholdDays', 'unitPrice', 'totalSalesAmount', 'carryoverSalesAmount', 'cashAmount', 'cardAmount', 'otherPaymentAmount', 'workerCount', 'sourceUnitPrice', 'currentQuantity', 'reason', 'status', 'closedAt', 'submittedAt', 'authorDisplayName', 'workMemo', 'expenseItems', 'expenseTotal', 'purchaseItems', 'purchaseTotal', 'laborItems', 'payrollTotal', 'lossItems', 'items', 'grossProfit', 'productivity', 'paymentDifferenceAmount', 'spec', 'defaultUnitPrice', 'appliedUnitPrice', 'inventoryAmount', 'adjustment', 'beforeQuantity', 'afterQuantity', 'differenceQuantity', 'beforeAmount', 'afterAmount', 'differenceAmount', 'displayName', 'rawName', 'rawSpec', 'marginRateBps', 'loginId', 'passwordChanged', 'profileNames', 'storeNames', 'fileName', 'startDate', 'endDate']::text[] ELSE ARRAY['productName', 'ledgerInputCodeName', 'workerName', 'name', 'displayName', 'productSpec', 'currentQuantity', 'quantity', 'unitPrice', 'amount', 'inventoryAmount', 'reason', 'memo']::text[] END);
    RETURN result;
  END IF;
  RETURN payload;
END;
$body$;

CREATE OR REPLACE FUNCTION audit_list_summary_v1(before_value jsonb, after_value jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $body$
  SELECT jsonb_build_object(
    'version', 1,
    'before', audit_list_snapshot_v1(before_value),
    'after', audit_list_snapshot_v1(after_value),
    'rootChanged', CASE
      WHEN jsonb_typeof(before_value) = 'object' OR jsonb_typeof(after_value) = 'object' THEN NULL
      ELSE audit_list_redacted_v1(before_value) IS DISTINCT FROM audit_list_redacted_v1(after_value)
    END
  );
$body$;

-- All producers, including direct create/createMany and repair tools, stay atomic.
CREATE OR REPLACE FUNCTION set_audit_list_summary_v1() RETURNS trigger
LANGUAGE plpgsql AS $body$
BEGIN
  NEW."listSummary" := audit_list_summary_v1(NEW."before", NEW."after");
  RETURN NEW;
END;
$body$;
DROP TRIGGER IF EXISTS audit_list_summary_before_insert ON "AuditLog";
CREATE TRIGGER audit_list_summary_before_insert
  BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION set_audit_list_summary_v1();
