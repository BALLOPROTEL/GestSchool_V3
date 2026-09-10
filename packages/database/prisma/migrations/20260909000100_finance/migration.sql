-- LOT 8: additive only. Historical columns, keys, checks and triggers are retained.
BEGIN;
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHECK', 'OTHER');
CREATE TYPE "InvoiceAdjustmentKind" AS ENUM ('DISCOUNT', 'SCHOLARSHIP', 'CREDIT', 'DEBIT', 'CORRECTION');
ALTER TABLE cash_sessions ADD COLUMN closing_reason VARCHAR(500), ADD COLUMN difference_amount_minor BIGINT, ADD COLUMN expected_closing_amount_minor BIGINT;
ALTER TABLE fee_schedules ADD COLUMN level_id UUID, ADD COLUMN school_class_id UUID;
ALTER TABLE fee_types ADD COLUMN archived_at TIMESTAMPTZ(6);
ALTER TABLE invoice_adjustments ADD COLUMN kind "InvoiceAdjustmentKind" NOT NULL DEFAULT 'CORRECTION';
ALTER TABLE invoice_lines ADD COLUMN due_on DATE, ADD COLUMN ordinal SMALLINT;
ALTER TABLE invoices ADD COLUMN academic_year_id UUID, ADD COLUMN class_name VARCHAR(120), ADD COLUMN enrollment_id UUID, ADD COLUMN fee_schedule_id UUID, ADD COLUMN student_name VARCHAR(240), ADD COLUMN year_name VARCHAR(100);
ALTER TABLE payment_reversals ADD COLUMN actor_membership_id UUID, ADD COLUMN cash_session_id UUID;
ALTER TABLE payments ADD COLUMN cancellation_reason VARCHAR(500), ADD COLUMN cancellation_requested_at TIMESTAMPTZ(6), ADD COLUMN cancellation_requested_by_membership_id UUID, ADD COLUMN cash_session_id UUID, ADD COLUMN created_by_membership_id UUID, ADD COLUMN method "PaymentMethod" NOT NULL DEFAULT 'OTHER', ADD COLUMN request_hash CHAR(64), ADD COLUMN validated_by_membership_id UUID;
CREATE TABLE fee_installments (
  id UUID NOT NULL DEFAULT uuidv7(), tenant_id UUID NOT NULL, fee_schedule_item_id UUID NOT NULL,
  amount_minor BIGINT NOT NULL, due_on DATE NOT NULL, ordinal SMALLINT NOT NULL,
  CONSTRAINT fee_installments_pkey PRIMARY KEY (id),
  CONSTRAINT fee_installments_money_order_check CHECK (amount_minor > 0 AND ordinal > 0)
);
CREATE UNIQUE INDEX fee_installments_tenant_id_id_key ON fee_installments(tenant_id,id);
CREATE UNIQUE INDEX fee_installments_tenant_id_fee_schedule_item_id_ordinal_key ON fee_installments(tenant_id,fee_schedule_item_id,ordinal);
CREATE UNIQUE INDEX enrollments_tenant_id_id_student_id_academic_year_id_key ON enrollments(tenant_id,id,student_id,academic_year_id);
CREATE INDEX fee_schedules_tenant_id_level_id_idx ON fee_schedules(tenant_id,level_id);
CREATE INDEX fee_schedules_tenant_id_school_class_id_idx ON fee_schedules(tenant_id,school_class_id);
CREATE INDEX invoices_tenant_id_academic_year_id_due_on_idx ON invoices(tenant_id,academic_year_id,due_on);
CREATE INDEX invoices_tenant_id_enrollment_id_idx ON invoices(tenant_id,enrollment_id);
CREATE INDEX payments_tenant_id_student_id_idx ON payments(tenant_id,student_id);
CREATE INDEX payments_tenant_id_cash_session_id_idx ON payments(tenant_id,cash_session_id);
CREATE INDEX payments_tenant_id_paid_at_idx ON payments(tenant_id,paid_at);
CREATE UNIQUE INDEX cash_sessions_one_open_cashier ON cash_sessions(tenant_id,opened_by_membership_id) WHERE status='OPEN';
ALTER TABLE fee_schedules ADD CONSTRAINT fee_schedules_tenant_id_level_id_fkey FOREIGN KEY (tenant_id,level_id) REFERENCES levels(tenant_id,id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE fee_schedules ADD CONSTRAINT fee_schedules_tenant_id_school_class_id_academic_year_id_fkey FOREIGN KEY (tenant_id,school_class_id,academic_year_id) REFERENCES school_classes(tenant_id,id,academic_year_id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE fee_installments ADD CONSTRAINT fee_installments_tenant_id_fee_schedule_item_id_fkey FOREIGN KEY (tenant_id,fee_schedule_item_id) REFERENCES fee_schedule_items(tenant_id,id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE invoices ADD CONSTRAINT invoices_tenant_id_enrollment_id_student_id_academic_year__fkey FOREIGN KEY (tenant_id,enrollment_id,student_id,academic_year_id) REFERENCES enrollments(tenant_id,id,student_id,academic_year_id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE invoices ADD CONSTRAINT invoices_tenant_id_academic_year_id_fkey FOREIGN KEY (tenant_id,academic_year_id) REFERENCES academic_years(tenant_id,id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE invoices ADD CONSTRAINT invoices_tenant_id_fee_schedule_id_fkey FOREIGN KEY (tenant_id,fee_schedule_id) REFERENCES fee_schedules(tenant_id,id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE payments ADD CONSTRAINT payments_tenant_id_cash_session_id_fkey FOREIGN KEY (tenant_id,cash_session_id) REFERENCES cash_sessions(tenant_id,id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE payments ADD CONSTRAINT payments_tenant_id_created_by_membership_id_fkey FOREIGN KEY (tenant_id,created_by_membership_id) REFERENCES memberships(tenant_id,id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE payments ADD CONSTRAINT payments_tenant_id_validated_by_membership_id_fkey FOREIGN KEY (tenant_id,validated_by_membership_id) REFERENCES memberships(tenant_id,id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE payments ADD CONSTRAINT payments_tenant_id_cancellation_requested_by_membership_id_fkey FOREIGN KEY (tenant_id,cancellation_requested_by_membership_id) REFERENCES memberships(tenant_id,id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE payment_reversals ADD CONSTRAINT payment_reversals_tenant_id_actor_membership_id_fkey FOREIGN KEY (tenant_id,actor_membership_id) REFERENCES memberships(tenant_id,id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE payment_reversals ADD CONSTRAINT payment_reversals_tenant_id_cash_session_id_fkey FOREIGN KEY (tenant_id,cash_session_id) REFERENCES cash_sessions(tenant_id,id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE invoice_lines ADD CONSTRAINT invoice_lines_exact_total_check CHECK (total_amount_minor::numeric=quantity::numeric*unit_amount_minor::numeric AND (ordinal IS NULL OR ordinal > 0));
ALTER TABLE invoice_adjustments ADD CONSTRAINT invoice_adjustments_kind_sign_check CHECK ((kind IN ('DISCOUNT','SCHOLARSHIP','CREDIT') AND amount_minor < 0) OR (kind='DEBIT' AND amount_minor > 0) OR kind='CORRECTION');
ALTER TABLE payments ADD CONSTRAINT payments_cancellation_request_check CHECK ((cancellation_requested_at IS NULL AND cancellation_requested_by_membership_id IS NULL AND cancellation_reason IS NULL) OR (cancellation_requested_at IS NOT NULL AND cancellation_requested_by_membership_id IS NOT NULL AND length(trim(cancellation_reason)) >= 3 AND status IN ('COMPLETED','REVERSED')));
ALTER TABLE payments ADD CONSTRAINT payments_cash_link_check CHECK ((method='CASH' AND cash_session_id IS NOT NULL) OR (method<>'CASH' AND cash_session_id IS NULL));
ALTER TABLE cash_sessions ADD CONSTRAINT cash_sessions_reconciliation_check CHECK ((expected_closing_amount_minor IS NULL AND difference_amount_minor IS NULL) OR (status='CLOSED' AND expected_closing_amount_minor IS NOT NULL AND difference_amount_minor::numeric=closing_amount_minor::numeric-expected_closing_amount_minor::numeric AND length(trim(closing_reason))>=3));

-- Lock order is shared with People/Academics/Enrollments. Applies to direct SQL too.
CREATE FUNCTION finance_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid; parent_status text;
BEGIN
  tid := CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  PERFORM id FROM tenants WHERE id=tid FOR UPDATE;
  IF TG_OP='UPDATE' AND (NEW.tenant_id<>OLD.tenant_id OR NEW.id<>OLD.id) THEN
    RAISE EXCEPTION 'FINANCE_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME IN ('receipts','payment_reversals','invoice_adjustments') AND TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'FINANCE_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='payments' AND TG_OP<>'INSERT' THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'FINANCE_IMMUTABLE' USING ERRCODE='23514'; END IF;
    IF OLD.status IN ('REVERSED','FAILED') THEN RAISE EXCEPTION 'FINANCE_IMMUTABLE' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-ARRAY['status','updated_at','paid_at','validated_by_membership_id','cancellation_requested_at','cancellation_requested_by_membership_id','cancellation_reason']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['status','updated_at','paid_at','validated_by_membership_id','cancellation_requested_at','cancellation_requested_by_membership_id','cancellation_reason']) THEN
      RAISE EXCEPTION 'FINANCE_IMMUTABLE' USING ERRCODE='23514';
    END IF;
    IF OLD.status='COMPLETED' AND (NEW.status NOT IN ('COMPLETED','REVERSED') OR NEW.paid_at IS DISTINCT FROM OLD.paid_at OR NEW.validated_by_membership_id IS DISTINCT FROM OLD.validated_by_membership_id OR (OLD.cancellation_requested_at IS NOT NULL AND (NEW.cancellation_requested_at IS DISTINCT FROM OLD.cancellation_requested_at OR NEW.cancellation_requested_by_membership_id IS DISTINCT FROM OLD.cancellation_requested_by_membership_id OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason))) THEN
      RAISE EXCEPTION 'FINANCE_IMMUTABLE' USING ERRCODE='23514';
    END IF;
    IF OLD.status='PENDING' AND NEW.status NOT IN ('PENDING','COMPLETED','FAILED') THEN RAISE EXCEPTION 'FINANCE_INVALID_TRANSITION' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_TABLE_NAME='payment_allocations' THEN
    SELECT status::text INTO parent_status FROM payments WHERE tenant_id=tid AND id=CASE WHEN TG_OP='DELETE' THEN OLD.payment_id ELSE NEW.payment_id END;
    IF parent_status<>'PENDING' OR TG_OP='UPDATE' THEN RAISE EXCEPTION 'FINANCE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_TABLE_NAME='invoice_lines' THEN
    SELECT status::text INTO parent_status FROM invoices WHERE tenant_id=tid AND id=CASE WHEN TG_OP='DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
    IF parent_status<>'DRAFT' OR TG_OP='UPDATE' THEN RAISE EXCEPTION 'FINANCE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_TABLE_NAME='invoices' AND TG_OP<>'INSERT' THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'FINANCE_IMMUTABLE' USING ERRCODE='23514'; END IF;
    IF OLD.status<>'DRAFT' AND (NEW.status='DRAFT' OR (to_jsonb(NEW)-ARRAY['status','updated_at','total_amount_minor']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at','total_amount_minor'])) THEN RAISE EXCEPTION 'FINANCE_IMMUTABLE' USING ERRCODE='23514'; END IF;
    IF OLD.status='VOID' THEN RAISE EXCEPTION 'FINANCE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_TABLE_NAME='cash_sessions' AND TG_OP<>'INSERT' THEN
    IF TG_OP='DELETE' OR OLD.status='CLOSED' THEN RAISE EXCEPTION 'FINANCE_IMMUTABLE' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-ARRAY['status','closed_at','closed_by_membership_id','closing_amount_minor','expected_closing_amount_minor','difference_amount_minor','closing_reason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','closed_at','closed_by_membership_id','closing_amount_minor','expected_closing_amount_minor','difference_amount_minor','closing_reason']) THEN RAISE EXCEPTION 'FINANCE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

-- Deferred checks allow atomic snapshot creation and validation + receipt + balance.
CREATE FUNCTION finance_consistency_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid;
BEGIN
  tid := CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  IF EXISTS (
    SELECT 1 FROM fee_schedule_items i JOIN fee_schedules s ON (s.tenant_id,s.id)=(i.tenant_id,i.fee_schedule_id)
    WHERE i.tenant_id=tid AND EXISTS (SELECT 1 FROM fee_installments f WHERE (f.tenant_id,f.fee_schedule_item_id)=(tid,i.id))
    AND (i.amount_minor<>(SELECT sum(f.amount_minor) FROM fee_installments f WHERE (f.tenant_id,f.fee_schedule_item_id)=(tid,i.id))
      OR EXISTS (SELECT 1 FROM fee_installments f JOIN academic_years y ON (y.tenant_id,y.id)=(s.tenant_id,s.academic_year_id) WHERE (f.tenant_id,f.fee_schedule_item_id)=(tid,i.id) AND (f.due_on<y.starts_on OR f.due_on>y.ends_on OR EXISTS (SELECT 1 FROM fee_installments g WHERE (g.tenant_id,g.fee_schedule_item_id)=(tid,i.id) AND g.ordinal<f.ordinal AND g.due_on>f.due_on))))
  ) THEN RAISE EXCEPTION 'FINANCE_INSTALLMENTS_INVALID' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM payments p WHERE p.tenant_id=tid AND (
      p.amount_minor < COALESCE((SELECT sum(a.amount_minor) FROM payment_allocations a WHERE (a.tenant_id,a.payment_id)=(tid,p.id)),0)
      OR (p.status IN ('COMPLETED','REVERSED') AND (p.paid_at IS NULL OR NOT EXISTS (SELECT 1 FROM receipts r WHERE (r.tenant_id,r.payment_id)=(tid,p.id))))
      OR (p.status='REVERSED' AND (p.cancellation_requested_at IS NULL OR p.amount_minor<>COALESCE((SELECT sum(r.amount_minor) FROM payment_reversals r WHERE (r.tenant_id,r.payment_id)=(tid,p.id)),0)))
      OR (p.status<>'REVERSED' AND EXISTS (SELECT 1 FROM payment_reversals r WHERE (r.tenant_id,r.payment_id)=(tid,p.id)))
    )
  ) THEN RAISE EXCEPTION 'FINANCE_PAYMENT_INVARIANT' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM payment_allocations a JOIN payments p ON (p.tenant_id,p.id)=(a.tenant_id,a.payment_id) JOIN invoices i ON (i.tenant_id,i.id)=(a.tenant_id,a.invoice_id)
    WHERE a.tenant_id=tid AND (p.currency<>i.currency OR p.student_id IS DISTINCT FROM i.student_id OR (p.status IN ('PENDING','COMPLETED') AND i.status IN ('DRAFT','VOID')))
  ) THEN RAISE EXCEPTION 'FINANCE_ALLOCATION_INVARIANT' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM invoices i WHERE i.tenant_id=tid AND i.status<>'DRAFT' AND (
      i.total_amount_minor <> COALESCE((SELECT sum(l.total_amount_minor) FROM invoice_lines l WHERE (l.tenant_id,l.invoice_id)=(tid,i.id)),0)+COALESCE((SELECT sum(a.amount_minor) FROM invoice_adjustments a WHERE (a.tenant_id,a.invoice_id)=(tid,i.id)),0)
      OR i.total_amount_minor < COALESCE((SELECT sum(a.amount_minor) FROM payment_allocations a JOIN payments p ON (p.tenant_id,p.id)=(a.tenant_id,a.payment_id) WHERE (a.tenant_id,a.invoice_id)=(tid,i.id) AND p.status='COMPLETED'),0)
    )
  ) THEN RAISE EXCEPTION 'FINANCE_INVOICE_INVARIANT' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM receipts r JOIN payments p ON (p.tenant_id,p.id)=(r.tenant_id,r.payment_id) WHERE r.tenant_id=tid AND (r.amount_minor<>p.amount_minor OR r.currency<>p.currency OR p.status NOT IN ('COMPLETED','REVERSED'))
  ) THEN RAISE EXCEPTION 'FINANCE_RECEIPT_INVARIANT' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM payments p JOIN cash_sessions c ON (c.tenant_id,c.id)=(p.tenant_id,p.cash_session_id) WHERE p.tenant_id=tid AND (p.currency<>c.currency OR p.created_by_membership_id IS DISTINCT FROM c.opened_by_membership_id OR (p.status='PENDING' AND c.status='CLOSED') OR p.paid_at<c.opened_at OR p.paid_at>c.closed_at)
  ) THEN RAISE EXCEPTION 'FINANCE_CASH_INVARIANT' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM payment_reversals r JOIN payments p ON (p.tenant_id,p.id)=(r.tenant_id,r.payment_id) LEFT JOIN cash_sessions c ON (c.tenant_id,c.id)=(r.tenant_id,r.cash_session_id)
    WHERE r.tenant_id=tid AND (r.actor_membership_id IS NULL OR length(trim(r.reason))<3 OR (p.method='CASH' AND (c.id IS NULL OR c.currency<>p.currency OR c.opened_by_membership_id<>r.actor_membership_id OR r.reversed_at<c.opened_at OR r.reversed_at>c.closed_at)) OR (p.method<>'CASH' AND r.cash_session_id IS NOT NULL))
  ) THEN RAISE EXCEPTION 'FINANCE_REVERSAL_INVARIANT' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM cash_sessions c WHERE c.tenant_id=tid AND c.status='CLOSED' AND c.expected_closing_amount_minor IS NOT NULL AND c.expected_closing_amount_minor <>
      c.opening_amount_minor + COALESCE((SELECT sum(p.amount_minor) FROM payments p WHERE (p.tenant_id,p.cash_session_id)=(tid,c.id) AND p.status IN ('COMPLETED','REVERSED')),0) - COALESCE((SELECT sum(r.amount_minor) FROM payment_reversals r WHERE (r.tenant_id,r.cash_session_id)=(tid,c.id)),0)
  ) THEN RAISE EXCEPTION 'FINANCE_CASH_BALANCE_INVARIANT' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['fee_types','fee_schedules','fee_schedule_items','fee_installments','invoices','invoice_lines','invoice_adjustments','payments','payment_allocations','payment_reversals','receipts','cash_sessions'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION finance_write_guard()', table_name || '_finance_write_guard', table_name);
    EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_consistency_guard()', table_name || '_finance_consistency_guard', table_name);
  END LOOP;
END $$;
COMMIT;
