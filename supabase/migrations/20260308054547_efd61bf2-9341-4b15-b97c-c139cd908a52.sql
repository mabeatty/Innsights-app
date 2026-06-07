
-- Function to touch projects.updated_at from related tables
CREATE OR REPLACE FUNCTION public.touch_project_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.projects SET updated_at = now() WHERE id = OLD.project_id;
    RETURN OLD;
  ELSE
    UPDATE public.projects SET updated_at = now() WHERE id = NEW.project_id;
    RETURN NEW;
  END IF;
END;
$$;

-- budget_transactions
CREATE TRIGGER trg_touch_project_on_budget_transactions
AFTER INSERT OR UPDATE OR DELETE ON public.budget_transactions
FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();

-- draw_history
CREATE TRIGGER trg_touch_project_on_draw_history
AFTER INSERT OR UPDATE OR DELETE ON public.draw_history
FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();

-- change_orders
CREATE TRIGGER trg_touch_project_on_change_orders
AFTER INSERT OR UPDATE OR DELETE ON public.change_orders
FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();

-- project_budget (G703 scheduled values)
CREATE TRIGGER trg_touch_project_on_project_budget
AFTER INSERT OR UPDATE OR DELETE ON public.project_budget
FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();

-- project_info
CREATE TRIGGER trg_touch_project_on_project_info
AFTER INSERT OR UPDATE OR DELETE ON public.project_info
FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();

-- project_documents
CREATE TRIGGER trg_touch_project_on_project_documents
AFTER INSERT OR UPDATE OR DELETE ON public.project_documents
FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();

-- schedule_phases
CREATE TRIGGER trg_touch_project_on_schedule_phases
AFTER INSERT OR UPDATE OR DELETE ON public.schedule_phases
FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();

-- schedule_milestones
CREATE TRIGGER trg_touch_project_on_schedule_milestones
AFTER INSERT OR UPDATE OR DELETE ON public.schedule_milestones
FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();

-- capital_cash_flow
CREATE TRIGGER trg_touch_project_on_capital_cash_flow
AFTER INSERT OR UPDATE OR DELETE ON public.capital_cash_flow
FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();

-- capital_equity_sources
CREATE TRIGGER trg_touch_project_on_capital_equity_sources
AFTER INSERT OR UPDATE OR DELETE ON public.capital_equity_sources
FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();

-- capital_debt_tranches
CREATE TRIGGER trg_touch_project_on_capital_debt_tranches
AFTER INSERT OR UPDATE OR DELETE ON public.capital_debt_tranches
FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();

-- capital_investors
CREATE TRIGGER trg_touch_project_on_capital_investors
AFTER INSERT OR UPDATE OR DELETE ON public.capital_investors
FOR EACH ROW EXECUTE FUNCTION public.touch_project_updated_at();
