-- Additional LOT 8 guards; the previously applied migration is not rewritten.
BEGIN;
CREATE FUNCTION finance_invoice_issue_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='DRAFT' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    -- Later collections/reversals of historical invoices remain possible after year closure.
    IF OLD.status<>'DRAFT' THEN RETURN NEW; END IF;
  END IF;
  PERFORM id FROM tenants WHERE id=NEW.tenant_id FOR UPDATE;
  IF NOT EXISTS (
    SELECT 1 FROM enrollments e
    JOIN students s ON (s.tenant_id,s.id)=(e.tenant_id,e.student_id)
    JOIN academic_years y ON (y.tenant_id,y.id)=(e.tenant_id,e.academic_year_id)
    JOIN school_classes c ON (c.tenant_id,c.id)=(e.tenant_id,e.school_class_id)
    JOIN levels l ON (l.tenant_id,l.id)=(c.tenant_id,c.level_id)
    JOIN fee_schedules f ON f.tenant_id=e.tenant_id AND f.id=NEW.fee_schedule_id
    WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.enrollment_id AND e.student_id=NEW.student_id
      AND e.academic_year_id=NEW.academic_year_id AND f.academic_year_id=e.academic_year_id
      AND e.status='ACTIVE' AND s.status='ACTIVE' AND c.status='ACTIVE' AND l.status='ACTIVE'
      AND y.status IN ('DRAFT','ACTIVE') AND f.currency=NEW.currency
      AND (f.level_id IS NULL OR f.level_id=c.level_id)
      AND (f.school_class_id IS NULL OR f.school_class_id=c.id)
      AND NEW.issued_on BETWEEN y.starts_on AND y.ends_on
  ) THEN RAISE EXCEPTION 'FINANCE_INVOICE_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoices_finance_issue_guard BEFORE INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION finance_invoice_issue_guard();

CREATE FUNCTION finance_catalog_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM tenants WHERE id=NEW.tenant_id FOR UPDATE;
  IF TG_TABLE_NAME='fee_schedules' THEN
    IF NEW.school_class_id IS NOT NULL AND NEW.level_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM school_classes c WHERE (c.tenant_id,c.id)=(NEW.tenant_id,NEW.school_class_id) AND c.level_id<>NEW.level_id
    ) THEN RAISE EXCEPTION 'FINANCE_CLASS_YEAR_MISMATCH' USING ERRCODE='23514'; END IF;
  ELSE
    IF NEW.due_on IS NOT NULL AND EXISTS (
      SELECT 1 FROM fee_schedules f JOIN academic_years y ON (y.tenant_id,y.id)=(f.tenant_id,f.academic_year_id)
      WHERE (f.tenant_id,f.id)=(NEW.tenant_id,NEW.fee_schedule_id) AND NEW.due_on NOT BETWEEN y.starts_on AND y.ends_on
    ) THEN RAISE EXCEPTION 'FINANCE_INSTALLMENTS_INVALID' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fee_schedules_finance_catalog_guard BEFORE INSERT OR UPDATE ON fee_schedules FOR EACH ROW EXECUTE FUNCTION finance_catalog_guard();
CREATE TRIGGER fee_schedule_items_finance_catalog_guard BEFORE INSERT OR UPDATE ON fee_schedule_items FOR EACH ROW EXECUTE FUNCTION finance_catalog_guard();

CREATE FUNCTION finance_derived_state_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid;
BEGIN
  tid:=CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  IF EXISTS (
    SELECT 1 FROM invoices i LEFT JOIN LATERAL (
      SELECT coalesce(sum(a.amount_minor),0) amount FROM payment_allocations a JOIN payments p ON (p.tenant_id,p.id)=(a.tenant_id,a.payment_id)
      WHERE (a.tenant_id,a.invoice_id)=(i.tenant_id,i.id) AND p.status='COMPLETED'
    ) paid ON true WHERE i.tenant_id=tid AND (
      (i.status='PAID' AND paid.amount<>i.total_amount_minor)
      OR (i.status='PARTIALLY_PAID' AND (paid.amount<=0 OR paid.amount>=i.total_amount_minor))
      OR (i.status='ISSUED' AND (paid.amount<>0 OR i.total_amount_minor=0))
      OR (i.status='VOID' AND paid.amount<>0)
    )
  ) THEN RAISE EXCEPTION 'FINANCE_INVOICE_STATUS_INVALID' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM cash_sessions c WHERE c.tenant_id=tid AND
      c.opening_amount_minor+coalesce((SELECT sum(p.amount_minor) FROM payments p WHERE (p.tenant_id,p.cash_session_id)=(c.tenant_id,c.id) AND p.status IN ('COMPLETED','REVERSED')),0)
      -coalesce((SELECT sum(r.amount_minor) FROM payment_reversals r WHERE (r.tenant_id,r.cash_session_id)=(c.tenant_id,c.id)),0)<0
  ) THEN RAISE EXCEPTION 'FINANCE_INSUFFICIENT_BALANCE' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['invoices','payments','payment_allocations','payment_reversals','cash_sessions'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_derived_state_guard()',table_name||'_finance_derived_state_guard',table_name);
  END LOOP;
END $$;
COMMIT;
