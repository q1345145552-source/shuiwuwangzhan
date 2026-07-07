--
-- PostgreSQL database dump
--

\restrict qWlIoJ8qP61IU7x8ziUgv9epElQQ22Vx8QruDz9AbOYnPXfJISY057nFHZR0lPa

-- Dumped from database version 18.4 (Postgres.app)
-- Dumped by pg_dump version 18.4 (Postgres.app)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounting_periods; Type: TABLE; Schema: public; Owner: liuxiong
--

CREATE TABLE public.accounting_periods (
    id integer NOT NULL,
    company_id integer NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT accounting_periods_month_check CHECK (((month >= 1) AND (month <= 12)))
);


ALTER TABLE public.accounting_periods OWNER TO liuxiong;

--
-- Name: accounting_periods_id_seq; Type: SEQUENCE; Schema: public; Owner: liuxiong
--

CREATE SEQUENCE public.accounting_periods_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.accounting_periods_id_seq OWNER TO liuxiong;

--
-- Name: accounting_periods_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liuxiong
--

ALTER SEQUENCE public.accounting_periods_id_seq OWNED BY public.accounting_periods.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    company_id integer,
    user_name character varying(50) DEFAULT '管理员'::character varying NOT NULL,
    action character varying(50) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id integer,
    description text,
    old_value jsonb,
    new_value jsonb,
    ip_address character varying(50) DEFAULT 'local'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_logs_id_seq OWNER TO postgres;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: audit_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_reports (
    id integer NOT NULL,
    company_id integer NOT NULL,
    year integer NOT NULL,
    report_no character varying(50),
    risk_level character varying(20) DEFAULT 'low'::character varying,
    sections jsonb,
    summary jsonb,
    pdf_filename character varying(200),
    pdf_path text,
    status character varying(20) DEFAULT 'generated'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.audit_reports OWNER TO postgres;

--
-- Name: audit_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.audit_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_reports_id_seq OWNER TO postgres;

--
-- Name: audit_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.audit_reports_id_seq OWNED BY public.audit_reports.id;


--
-- Name: bank_transactions; Type: TABLE; Schema: public; Owner: liuxiong
--

CREATE TABLE public.bank_transactions (
    id integer NOT NULL,
    company_id integer NOT NULL,
    period_id integer NOT NULL,
    bank_account character varying(50),
    transaction_date date NOT NULL,
    type character varying(10) NOT NULL,
    amount_thb numeric(15,2) DEFAULT 0,
    amount_cny numeric(15,2) DEFAULT 0,
    description text,
    matched_entry_id bigint,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT bank_transactions_type_check CHECK (((type)::text = ANY ((ARRAY['income'::character varying, 'expense'::character varying])::text[])))
);


ALTER TABLE public.bank_transactions OWNER TO liuxiong;

--
-- Name: bank_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: liuxiong
--

CREATE SEQUENCE public.bank_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bank_transactions_id_seq OWNER TO liuxiong;

--
-- Name: bank_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liuxiong
--

ALTER SEQUENCE public.bank_transactions_id_seq OWNED BY public.bank_transactions.id;


--
-- Name: cit_half_year; Type: TABLE; Schema: public; Owner: liuxiong
--

CREATE TABLE public.cit_half_year (
    id integer NOT NULL,
    company_id integer NOT NULL,
    year integer NOT NULL,
    half_year_revenue numeric(15,2) DEFAULT 0,
    half_year_expenses numeric(15,2) DEFAULT 0,
    estimated_profit numeric(15,2) DEFAULT 0,
    estimated_tax numeric(15,2) DEFAULT 0,
    paid_amount numeric(15,2) DEFAULT 0,
    status character varying(20) DEFAULT 'draft'::character varying,
    paid_date date,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.cit_half_year OWNER TO liuxiong;

--
-- Name: cit_half_year_id_seq; Type: SEQUENCE; Schema: public; Owner: liuxiong
--

CREATE SEQUENCE public.cit_half_year_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cit_half_year_id_seq OWNER TO liuxiong;

--
-- Name: cit_half_year_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liuxiong
--

ALTER SEQUENCE public.cit_half_year_id_seq OWNED BY public.cit_half_year.id;


--
-- Name: cit_reports; Type: TABLE; Schema: public; Owner: liuxiong
--

CREATE TABLE public.cit_reports (
    id integer NOT NULL,
    company_id integer NOT NULL,
    year integer NOT NULL,
    total_revenue numeric(15,2) DEFAULT 0,
    platform_revenue numeric(15,2) DEFAULT 0,
    other_revenue numeric(15,2) DEFAULT 0,
    total_expenses numeric(15,2) DEFAULT 0,
    cost_of_goods numeric(15,2) DEFAULT 0,
    platform_fees numeric(15,2) DEFAULT 0,
    advertising_fees numeric(15,2) DEFAULT 0,
    shipping_fees numeric(15,2) DEFAULT 0,
    rental_fees numeric(15,2) DEFAULT 0,
    salary_fees numeric(15,2) DEFAULT 0,
    warehouse_fees numeric(15,2) DEFAULT 0,
    utility_fees numeric(15,2) DEFAULT 0,
    other_expenses numeric(15,2) DEFAULT 0,
    import_duty numeric(15,2) DEFAULT 0,
    net_profit numeric(15,2) DEFAULT 0,
    tax_base numeric(15,2) DEFAULT 0,
    tax_rate numeric(5,2) DEFAULT 0,
    tax_amount numeric(15,2) DEFAULT 0,
    wht_credit numeric(15,2) DEFAULT 0,
    half_year_paid numeric(15,2) DEFAULT 0,
    tax_payable numeric(15,2) DEFAULT 0,
    status character varying(20) DEFAULT 'draft'::character varying,
    filed_date date,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.cit_reports OWNER TO liuxiong;

--
-- Name: cit_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: liuxiong
--

CREATE SEQUENCE public.cit_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cit_reports_id_seq OWNER TO liuxiong;

--
-- Name: cit_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liuxiong
--

ALTER SEQUENCE public.cit_reports_id_seq OWNED BY public.cit_reports.id;


--
-- Name: companies; Type: TABLE; Schema: public; Owner: liuxiong
--

CREATE TABLE public.companies (
    id integer NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(200) NOT NULL,
    tax_id character varying(20),
    vat_number character varying(20),
    vat_registered boolean DEFAULT false,
    address text,
    director character varying(100),
    contacts text,
    accounting_start date DEFAULT '2025-01-01'::date,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    contact_person character varying(100),
    phone character varying(30),
    wechat character varying(50),
    email character varying(100),
    address_th text,
    address_en text,
    business_type character varying(50),
    platforms text[],
    tags text[],
    logo_url text,
    service_start_date date,
    monthly_service_fee numeric(10,2),
    last_contact_date date,
    registered_capital numeric(15,2) DEFAULT 0
);


ALTER TABLE public.companies OWNER TO liuxiong;

--
-- Name: companies_id_seq; Type: SEQUENCE; Schema: public; Owner: liuxiong
--

CREATE SEQUENCE public.companies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.companies_id_seq OWNER TO liuxiong;

--
-- Name: companies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liuxiong
--

ALTER SEQUENCE public.companies_id_seq OWNED BY public.companies.id;


--
-- Name: compliance_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.compliance_settings (
    id integer NOT NULL,
    company_id integer NOT NULL,
    vat_registered boolean DEFAULT false,
    has_employees boolean DEFAULT false,
    has_rental_expense boolean DEFAULT false,
    has_foreign_payment boolean DEFAULT false,
    vat_threshold_alert boolean DEFAULT true,
    reminder_days integer DEFAULT 3,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.compliance_settings OWNER TO postgres;

--
-- Name: compliance_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.compliance_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.compliance_settings_id_seq OWNER TO postgres;

--
-- Name: compliance_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.compliance_settings_id_seq OWNED BY public.compliance_settings.id;


--
-- Name: ecommerce_sales; Type: TABLE; Schema: public; Owner: liuxiong
--

CREATE TABLE public.ecommerce_sales (
    id integer NOT NULL,
    company_id integer NOT NULL,
    period_id integer NOT NULL,
    platform_sales numeric(15,2) DEFAULT 0,
    platform_refunds numeric(15,2) DEFAULT 0,
    other_income numeric(15,2) DEFAULT 0,
    platform_fees numeric(15,2) DEFAULT 0,
    advertising_fees numeric(15,2) DEFAULT 0,
    shipping_fees numeric(15,2) DEFAULT 0,
    cost_of_goods numeric(15,2) DEFAULT 0,
    rental_fees numeric(15,2) DEFAULT 0,
    salary_fees numeric(15,2) DEFAULT 0,
    warehouse_fees numeric(15,2) DEFAULT 0,
    other_expenses numeric(15,2) DEFAULT 0,
    import_vat_paid numeric(15,2) DEFAULT 0,
    import_duty_paid numeric(15,2) DEFAULT 0,
    vat_sales_calculated numeric(15,2) DEFAULT 0,
    vat_purchases_calculated numeric(15,2) DEFAULT 0,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.ecommerce_sales OWNER TO liuxiong;

--
-- Name: ecommerce_sales_id_seq; Type: SEQUENCE; Schema: public; Owner: liuxiong
--

CREATE SEQUENCE public.ecommerce_sales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ecommerce_sales_id_seq OWNER TO liuxiong;

--
-- Name: ecommerce_sales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liuxiong
--

ALTER SEQUENCE public.ecommerce_sales_id_seq OWNED BY public.ecommerce_sales.id;


--
-- Name: employees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employees (
    id integer NOT NULL,
    company_id integer NOT NULL,
    employee_code character varying(20) NOT NULL,
    full_name character varying(200) NOT NULL,
    nationality character varying(50) DEFAULT 'ไทย'::character varying,
    id_card_no character varying(30),
    "position" character varying(100),
    salary numeric(15,2) NOT NULL,
    social_security_base numeric(15,2),
    start_date date NOT NULL,
    end_date date,
    is_active boolean DEFAULT true,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.employees OWNER TO postgres;

--
-- Name: employees_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.employees_id_seq OWNER TO postgres;

--
-- Name: employees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.employees_id_seq OWNED BY public.employees.id;


--
-- Name: exchange_rates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.exchange_rates (
    id integer NOT NULL,
    company_id integer NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    rate_thb_cny numeric(10,4) NOT NULL,
    rate_cny_thb numeric(10,4) NOT NULL,
    source character varying(50) DEFAULT 'manual'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT exchange_rates_month_check CHECK (((month >= 1) AND (month <= 12)))
);


ALTER TABLE public.exchange_rates OWNER TO postgres;

--
-- Name: exchange_rates_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.exchange_rates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.exchange_rates_id_seq OWNER TO postgres;

--
-- Name: exchange_rates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.exchange_rates_id_seq OWNED BY public.exchange_rates.id;


--
-- Name: expense_details; Type: TABLE; Schema: public; Owner: liuxiong
--

CREATE TABLE public.expense_details (
    id integer NOT NULL,
    company_id integer NOT NULL,
    period_id integer NOT NULL,
    expense_date date NOT NULL,
    category character varying(30) NOT NULL,
    payee_name character varying(200),
    payee_tax_id character varying(20),
    description text,
    amount numeric(15,2) NOT NULL,
    vat_amount numeric(15,2) DEFAULT 0,
    total_amount numeric(15,2) NOT NULL,
    has_wht boolean DEFAULT false,
    wht_rate numeric(5,2) DEFAULT 0,
    wht_amount numeric(15,2) DEFAULT 0,
    wht_certificate_no character varying(50),
    wht_deducted_for_cit boolean DEFAULT false,
    original_filename text,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.expense_details OWNER TO liuxiong;

--
-- Name: expense_details_id_seq; Type: SEQUENCE; Schema: public; Owner: liuxiong
--

CREATE SEQUENCE public.expense_details_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.expense_details_id_seq OWNER TO liuxiong;

--
-- Name: expense_details_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liuxiong
--

ALTER SEQUENCE public.expense_details_id_seq OWNED BY public.expense_details.id;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: liuxiong
--

CREATE TABLE public.invoices (
    id integer NOT NULL,
    company_id integer NOT NULL,
    period_id integer NOT NULL,
    type character varying(20) NOT NULL,
    invoice_no character varying(50) NOT NULL,
    customer_name character varying(200) NOT NULL,
    customer_tax_id character varying(20),
    items jsonb,
    total_ex_vat numeric(15,2) DEFAULT 0,
    vat_amount numeric(15,2) DEFAULT 0,
    total_inc_vat numeric(15,2) DEFAULT 0,
    status character varying(20) DEFAULT 'draft'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT invoices_type_check CHECK (((type)::text = ANY ((ARRAY['tax_invoice'::character varying, 'receipt'::character varying])::text[])))
);


ALTER TABLE public.invoices OWNER TO liuxiong;

--
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: liuxiong
--

CREATE SEQUENCE public.invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.invoices_id_seq OWNER TO liuxiong;

--
-- Name: invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liuxiong
--

ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;


--
-- Name: platform_imports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.platform_imports (
    id integer NOT NULL,
    company_id integer NOT NULL,
    period_id integer,
    platform character varying(30) NOT NULL,
    filename character varying(200),
    import_type character varying(30) DEFAULT 'vat_output'::character varying,
    total_rows integer DEFAULT 0,
    success_rows integer DEFAULT 0,
    failed_rows integer DEFAULT 0,
    errors jsonb,
    status character varying(20) DEFAULT 'completed'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.platform_imports OWNER TO postgres;

--
-- Name: platform_imports_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.platform_imports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.platform_imports_id_seq OWNER TO postgres;

--
-- Name: platform_imports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.platform_imports_id_seq OWNED BY public.platform_imports.id;


--
-- Name: platform_raw_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.platform_raw_orders (
    id integer NOT NULL,
    company_id integer NOT NULL,
    period_id integer,
    platform character varying(30) NOT NULL,
    order_id character varying(100) NOT NULL,
    order_date date,
    customer_name character varying(200),
    product_name text,
    total_amount numeric(15,2),
    platform_fee numeric(15,2) DEFAULT 0,
    shipping_fee numeric(15,2) DEFAULT 0,
    other_fee numeric(15,2) DEFAULT 0,
    net_amount numeric(15,2),
    quantity integer DEFAULT 1,
    matched_to_detail boolean DEFAULT false,
    matched_detail_id integer,
    import_id integer,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.platform_raw_orders OWNER TO postgres;

--
-- Name: platform_raw_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.platform_raw_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.platform_raw_orders_id_seq OWNER TO postgres;

--
-- Name: platform_raw_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.platform_raw_orders_id_seq OWNED BY public.platform_raw_orders.id;


--
-- Name: pnd1_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pnd1_reports (
    id integer NOT NULL,
    company_id integer NOT NULL,
    period_id integer NOT NULL,
    total_salary numeric(15,2) DEFAULT 0,
    total_exempt numeric(15,2) DEFAULT 0,
    total_taxable numeric(15,2) DEFAULT 0,
    total_wht numeric(15,2) DEFAULT 0,
    total_ss_employer numeric(15,2) DEFAULT 0,
    total_ss_employee numeric(15,2) DEFAULT 0,
    employee_count integer DEFAULT 0,
    status character varying(20) DEFAULT 'draft'::character varying,
    filed_date date,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.pnd1_reports OWNER TO postgres;

--
-- Name: pnd1_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pnd1_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pnd1_reports_id_seq OWNER TO postgres;

--
-- Name: pnd1_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pnd1_reports_id_seq OWNED BY public.pnd1_reports.id;


--
-- Name: social_security_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.social_security_records (
    id integer NOT NULL,
    company_id integer NOT NULL,
    employee_id integer NOT NULL,
    period_id integer NOT NULL,
    salary numeric(15,2) NOT NULL,
    ss_base numeric(15,2) NOT NULL,
    employer_contribution numeric(15,2) NOT NULL,
    employee_contribution numeric(15,2) NOT NULL,
    total_contribution numeric(15,2) NOT NULL,
    paid boolean DEFAULT false,
    paid_date date,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.social_security_records OWNER TO postgres;

--
-- Name: social_security_records_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.social_security_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.social_security_records_id_seq OWNER TO postgres;

--
-- Name: social_security_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.social_security_records_id_seq OWNED BY public.social_security_records.id;


--
-- Name: tax_calendar; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tax_calendar (
    id integer NOT NULL,
    company_id integer NOT NULL,
    tax_type character varying(20) NOT NULL,
    tax_name character varying(50) NOT NULL,
    due_date date NOT NULL,
    period_year integer NOT NULL,
    period_month integer,
    status character varying(20) DEFAULT 'pending'::character varying,
    overdue_days integer DEFAULT 0,
    estimated_penalty numeric(15,2) DEFAULT 0,
    submitted_date date,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.tax_calendar OWNER TO postgres;

--
-- Name: tax_calendar_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tax_calendar_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tax_calendar_id_seq OWNER TO postgres;

--
-- Name: tax_calendar_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tax_calendar_id_seq OWNED BY public.tax_calendar.id;


--
-- Name: vat_compliance; Type: TABLE; Schema: public; Owner: liuxiong
--

CREATE TABLE public.vat_compliance (
    id integer NOT NULL,
    company_id integer NOT NULL,
    period_id integer,
    check_date date NOT NULL,
    vat_registered boolean DEFAULT false,
    annualized_revenue numeric(15,2) DEFAULT 0,
    exceeds_threshold boolean DEFAULT false,
    months_overdue integer DEFAULT 0,
    estimated_vat_owed numeric(15,2) DEFAULT 0,
    estimated_surcharge numeric(15,2) DEFAULT 0,
    estimated_fine numeric(15,2) DEFAULT 0,
    total_estimated_liability numeric(15,2) DEFAULT 0,
    status character varying(20) DEFAULT 'draft'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.vat_compliance OWNER TO liuxiong;

--
-- Name: vat_compliance_id_seq; Type: SEQUENCE; Schema: public; Owner: liuxiong
--

CREATE SEQUENCE public.vat_compliance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vat_compliance_id_seq OWNER TO liuxiong;

--
-- Name: vat_compliance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liuxiong
--

ALTER SEQUENCE public.vat_compliance_id_seq OWNED BY public.vat_compliance.id;


--
-- Name: vat_input_details; Type: TABLE; Schema: public; Owner: liuxiong
--

CREATE TABLE public.vat_input_details (
    id integer NOT NULL,
    company_id integer NOT NULL,
    period_id integer NOT NULL,
    invoice_date date NOT NULL,
    invoice_no character varying(50),
    supplier_name character varying(200) NOT NULL,
    supplier_tax_id character varying(20),
    description text,
    amount_ex_vat numeric(15,2) NOT NULL,
    vat_amount numeric(15,2) NOT NULL,
    total_amount numeric(15,2) NOT NULL,
    deductible boolean DEFAULT true,
    category character varying(30) DEFAULT 'purchase'::character varying,
    original_filename text,
    source character varying(20) DEFAULT 'manual'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.vat_input_details OWNER TO liuxiong;

--
-- Name: vat_input_details_id_seq; Type: SEQUENCE; Schema: public; Owner: liuxiong
--

CREATE SEQUENCE public.vat_input_details_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vat_input_details_id_seq OWNER TO liuxiong;

--
-- Name: vat_input_details_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liuxiong
--

ALTER SEQUENCE public.vat_input_details_id_seq OWNED BY public.vat_input_details.id;


--
-- Name: vat_output_details; Type: TABLE; Schema: public; Owner: liuxiong
--

CREATE TABLE public.vat_output_details (
    id integer NOT NULL,
    company_id integer NOT NULL,
    period_id integer NOT NULL,
    invoice_date date NOT NULL,
    invoice_no character varying(50),
    customer_name character varying(200),
    customer_tax_id character varying(20),
    description text,
    amount_ex_vat numeric(15,2) NOT NULL,
    vat_amount numeric(15,2) NOT NULL,
    total_amount numeric(15,2) NOT NULL,
    source character varying(20) DEFAULT 'manual'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.vat_output_details OWNER TO liuxiong;

--
-- Name: vat_output_details_id_seq; Type: SEQUENCE; Schema: public; Owner: liuxiong
--

CREATE SEQUENCE public.vat_output_details_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vat_output_details_id_seq OWNER TO liuxiong;

--
-- Name: vat_output_details_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liuxiong
--

ALTER SEQUENCE public.vat_output_details_id_seq OWNED BY public.vat_output_details.id;


--
-- Name: vat_reports; Type: TABLE; Schema: public; Owner: liuxiong
--

CREATE TABLE public.vat_reports (
    id integer NOT NULL,
    company_id integer NOT NULL,
    period_id integer NOT NULL,
    sales_amount numeric(15,2) DEFAULT 0,
    vat_sales numeric(15,2) DEFAULT 0,
    purchase_amount numeric(15,2) DEFAULT 0,
    vat_purchases numeric(15,2) DEFAULT 0,
    credit_forward numeric(15,2) DEFAULT 0,
    vat_payable numeric(15,2) DEFAULT 0,
    vat_credit_carry numeric(15,2) DEFAULT 0,
    status character varying(20) DEFAULT 'draft'::character varying,
    filed_date date,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.vat_reports OWNER TO liuxiong;

--
-- Name: vat_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: liuxiong
--

CREATE SEQUENCE public.vat_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vat_reports_id_seq OWNER TO liuxiong;

--
-- Name: vat_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liuxiong
--

ALTER SEQUENCE public.vat_reports_id_seq OWNED BY public.vat_reports.id;


--
-- Name: wht_details; Type: TABLE; Schema: public; Owner: liuxiong
--

CREATE TABLE public.wht_details (
    id integer NOT NULL,
    report_id integer NOT NULL,
    payment_date date NOT NULL,
    payee_name character varying(200) NOT NULL,
    payee_tax_id character varying(20),
    payment_type character varying(30) NOT NULL,
    payment_amount numeric(15,2) NOT NULL,
    wht_rate numeric(5,2) NOT NULL,
    wht_amount numeric(15,2) NOT NULL,
    invoice_ref character varying(50),
    description text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.wht_details OWNER TO liuxiong;

--
-- Name: wht_details_id_seq; Type: SEQUENCE; Schema: public; Owner: liuxiong
--

CREATE SEQUENCE public.wht_details_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.wht_details_id_seq OWNER TO liuxiong;

--
-- Name: wht_details_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liuxiong
--

ALTER SEQUENCE public.wht_details_id_seq OWNED BY public.wht_details.id;


--
-- Name: wht_reports; Type: TABLE; Schema: public; Owner: liuxiong
--

CREATE TABLE public.wht_reports (
    id integer NOT NULL,
    company_id integer NOT NULL,
    period_id integer NOT NULL,
    report_type character varying(10) NOT NULL,
    total_payment numeric(15,2) DEFAULT 0,
    total_wht numeric(15,2) DEFAULT 0,
    entry_count integer DEFAULT 0,
    status character varying(20) DEFAULT 'draft'::character varying,
    filed_date date,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT wht_reports_report_type_check CHECK (((report_type)::text = ANY ((ARRAY['pnd53'::character varying, 'pnd54'::character varying, 'pnd1'::character varying])::text[])))
);


ALTER TABLE public.wht_reports OWNER TO liuxiong;

--
-- Name: wht_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: liuxiong
--

CREATE SEQUENCE public.wht_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.wht_reports_id_seq OWNER TO liuxiong;

--
-- Name: wht_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liuxiong
--

ALTER SEQUENCE public.wht_reports_id_seq OWNED BY public.wht_reports.id;


--
-- Name: accounting_periods id; Type: DEFAULT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.accounting_periods ALTER COLUMN id SET DEFAULT nextval('public.accounting_periods_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: audit_reports id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_reports ALTER COLUMN id SET DEFAULT nextval('public.audit_reports_id_seq'::regclass);


--
-- Name: bank_transactions id; Type: DEFAULT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.bank_transactions ALTER COLUMN id SET DEFAULT nextval('public.bank_transactions_id_seq'::regclass);


--
-- Name: cit_half_year id; Type: DEFAULT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.cit_half_year ALTER COLUMN id SET DEFAULT nextval('public.cit_half_year_id_seq'::regclass);


--
-- Name: cit_reports id; Type: DEFAULT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.cit_reports ALTER COLUMN id SET DEFAULT nextval('public.cit_reports_id_seq'::regclass);


--
-- Name: companies id; Type: DEFAULT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.companies ALTER COLUMN id SET DEFAULT nextval('public.companies_id_seq'::regclass);


--
-- Name: compliance_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_settings ALTER COLUMN id SET DEFAULT nextval('public.compliance_settings_id_seq'::regclass);


--
-- Name: ecommerce_sales id; Type: DEFAULT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.ecommerce_sales ALTER COLUMN id SET DEFAULT nextval('public.ecommerce_sales_id_seq'::regclass);


--
-- Name: employees id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees ALTER COLUMN id SET DEFAULT nextval('public.employees_id_seq'::regclass);


--
-- Name: exchange_rates id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.exchange_rates ALTER COLUMN id SET DEFAULT nextval('public.exchange_rates_id_seq'::regclass);


--
-- Name: expense_details id; Type: DEFAULT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.expense_details ALTER COLUMN id SET DEFAULT nextval('public.expense_details_id_seq'::regclass);


--
-- Name: invoices id; Type: DEFAULT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);


--
-- Name: platform_imports id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_imports ALTER COLUMN id SET DEFAULT nextval('public.platform_imports_id_seq'::regclass);


--
-- Name: platform_raw_orders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_raw_orders ALTER COLUMN id SET DEFAULT nextval('public.platform_raw_orders_id_seq'::regclass);


--
-- Name: pnd1_reports id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pnd1_reports ALTER COLUMN id SET DEFAULT nextval('public.pnd1_reports_id_seq'::regclass);


--
-- Name: social_security_records id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.social_security_records ALTER COLUMN id SET DEFAULT nextval('public.social_security_records_id_seq'::regclass);


--
-- Name: tax_calendar id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tax_calendar ALTER COLUMN id SET DEFAULT nextval('public.tax_calendar_id_seq'::regclass);


--
-- Name: vat_compliance id; Type: DEFAULT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.vat_compliance ALTER COLUMN id SET DEFAULT nextval('public.vat_compliance_id_seq'::regclass);


--
-- Name: vat_input_details id; Type: DEFAULT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.vat_input_details ALTER COLUMN id SET DEFAULT nextval('public.vat_input_details_id_seq'::regclass);


--
-- Name: vat_output_details id; Type: DEFAULT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.vat_output_details ALTER COLUMN id SET DEFAULT nextval('public.vat_output_details_id_seq'::regclass);


--
-- Name: vat_reports id; Type: DEFAULT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.vat_reports ALTER COLUMN id SET DEFAULT nextval('public.vat_reports_id_seq'::regclass);


--
-- Name: wht_details id; Type: DEFAULT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.wht_details ALTER COLUMN id SET DEFAULT nextval('public.wht_details_id_seq'::regclass);


--
-- Name: wht_reports id; Type: DEFAULT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.wht_reports ALTER COLUMN id SET DEFAULT nextval('public.wht_reports_id_seq'::regclass);


--
-- Name: accounting_periods accounting_periods_company_id_year_month_key; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.accounting_periods
    ADD CONSTRAINT accounting_periods_company_id_year_month_key UNIQUE (company_id, year, month);


--
-- Name: accounting_periods accounting_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.accounting_periods
    ADD CONSTRAINT accounting_periods_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: audit_reports audit_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_reports
    ADD CONSTRAINT audit_reports_pkey PRIMARY KEY (id);


--
-- Name: bank_transactions bank_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_pkey PRIMARY KEY (id);


--
-- Name: cit_half_year cit_half_year_company_id_year_key; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.cit_half_year
    ADD CONSTRAINT cit_half_year_company_id_year_key UNIQUE (company_id, year);


--
-- Name: cit_half_year cit_half_year_pkey; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.cit_half_year
    ADD CONSTRAINT cit_half_year_pkey PRIMARY KEY (id);


--
-- Name: cit_reports cit_reports_company_id_year_key; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.cit_reports
    ADD CONSTRAINT cit_reports_company_id_year_key UNIQUE (company_id, year);


--
-- Name: cit_reports cit_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.cit_reports
    ADD CONSTRAINT cit_reports_pkey PRIMARY KEY (id);


--
-- Name: companies companies_code_key; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_code_key UNIQUE (code);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: compliance_settings compliance_settings_company_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_settings
    ADD CONSTRAINT compliance_settings_company_id_key UNIQUE (company_id);


--
-- Name: compliance_settings compliance_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_settings
    ADD CONSTRAINT compliance_settings_pkey PRIMARY KEY (id);


--
-- Name: ecommerce_sales ecommerce_sales_company_id_period_id_key; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.ecommerce_sales
    ADD CONSTRAINT ecommerce_sales_company_id_period_id_key UNIQUE (company_id, period_id);


--
-- Name: ecommerce_sales ecommerce_sales_pkey; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.ecommerce_sales
    ADD CONSTRAINT ecommerce_sales_pkey PRIMARY KEY (id);


--
-- Name: employees employees_company_id_employee_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_company_id_employee_code_key UNIQUE (company_id, employee_code);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: exchange_rates exchange_rates_company_id_year_month_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_company_id_year_month_key UNIQUE (company_id, year, month);


--
-- Name: exchange_rates exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_pkey PRIMARY KEY (id);


--
-- Name: expense_details expense_details_pkey; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.expense_details
    ADD CONSTRAINT expense_details_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: platform_imports platform_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_imports
    ADD CONSTRAINT platform_imports_pkey PRIMARY KEY (id);


--
-- Name: platform_raw_orders platform_raw_orders_company_id_platform_order_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_raw_orders
    ADD CONSTRAINT platform_raw_orders_company_id_platform_order_id_key UNIQUE (company_id, platform, order_id);


--
-- Name: platform_raw_orders platform_raw_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_raw_orders
    ADD CONSTRAINT platform_raw_orders_pkey PRIMARY KEY (id);


--
-- Name: pnd1_reports pnd1_reports_company_id_period_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pnd1_reports
    ADD CONSTRAINT pnd1_reports_company_id_period_id_key UNIQUE (company_id, period_id);


--
-- Name: pnd1_reports pnd1_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pnd1_reports
    ADD CONSTRAINT pnd1_reports_pkey PRIMARY KEY (id);


--
-- Name: social_security_records social_security_records_employee_id_period_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.social_security_records
    ADD CONSTRAINT social_security_records_employee_id_period_id_key UNIQUE (employee_id, period_id);


--
-- Name: social_security_records social_security_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.social_security_records
    ADD CONSTRAINT social_security_records_pkey PRIMARY KEY (id);


--
-- Name: tax_calendar tax_calendar_company_id_tax_type_period_year_period_month_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tax_calendar
    ADD CONSTRAINT tax_calendar_company_id_tax_type_period_year_period_month_key UNIQUE (company_id, tax_type, period_year, period_month);


--
-- Name: tax_calendar tax_calendar_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tax_calendar
    ADD CONSTRAINT tax_calendar_pkey PRIMARY KEY (id);


--
-- Name: vat_compliance vat_compliance_pkey; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.vat_compliance
    ADD CONSTRAINT vat_compliance_pkey PRIMARY KEY (id);


--
-- Name: vat_input_details vat_input_details_pkey; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.vat_input_details
    ADD CONSTRAINT vat_input_details_pkey PRIMARY KEY (id);


--
-- Name: vat_output_details vat_output_details_pkey; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.vat_output_details
    ADD CONSTRAINT vat_output_details_pkey PRIMARY KEY (id);


--
-- Name: vat_reports vat_reports_company_id_period_id_key; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.vat_reports
    ADD CONSTRAINT vat_reports_company_id_period_id_key UNIQUE (company_id, period_id);


--
-- Name: vat_reports vat_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.vat_reports
    ADD CONSTRAINT vat_reports_pkey PRIMARY KEY (id);


--
-- Name: wht_details wht_details_pkey; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.wht_details
    ADD CONSTRAINT wht_details_pkey PRIMARY KEY (id);


--
-- Name: wht_reports wht_reports_company_id_period_id_report_type_key; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.wht_reports
    ADD CONSTRAINT wht_reports_company_id_period_id_report_type_key UNIQUE (company_id, period_id, report_type);


--
-- Name: wht_reports wht_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.wht_reports
    ADD CONSTRAINT wht_reports_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_company ON public.audit_logs USING btree (company_id);


--
-- Name: idx_audit_entity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_audit_logs_company_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_company_time ON public.audit_logs USING btree (company_id, created_at);


--
-- Name: idx_audit_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_time ON public.audit_logs USING btree (created_at);


--
-- Name: idx_expense_category; Type: INDEX; Schema: public; Owner: liuxiong
--

CREATE INDEX idx_expense_category ON public.expense_details USING btree (company_id, category);


--
-- Name: idx_expense_details_company_period; Type: INDEX; Schema: public; Owner: liuxiong
--

CREATE INDEX idx_expense_details_company_period ON public.expense_details USING btree (company_id, period_id);


--
-- Name: idx_expense_period; Type: INDEX; Schema: public; Owner: liuxiong
--

CREATE INDEX idx_expense_period ON public.expense_details USING btree (company_id, period_id);


--
-- Name: idx_tax_calendar_status_due; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tax_calendar_status_due ON public.tax_calendar USING btree (status, due_date);


--
-- Name: idx_vat_input_period; Type: INDEX; Schema: public; Owner: liuxiong
--

CREATE INDEX idx_vat_input_period ON public.vat_input_details USING btree (company_id, period_id);


--
-- Name: idx_vat_output_period; Type: INDEX; Schema: public; Owner: liuxiong
--

CREATE INDEX idx_vat_output_period ON public.vat_output_details USING btree (company_id, period_id);


--
-- Name: idx_wht_detail_report; Type: INDEX; Schema: public; Owner: liuxiong
--

CREATE INDEX idx_wht_detail_report ON public.wht_details USING btree (report_id);


--
-- Name: accounting_periods accounting_periods_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.accounting_periods
    ADD CONSTRAINT accounting_periods_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: audit_reports audit_reports_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_reports
    ADD CONSTRAINT audit_reports_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: bank_transactions bank_transactions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: bank_transactions bank_transactions_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.accounting_periods(id) ON DELETE CASCADE;


--
-- Name: cit_half_year cit_half_year_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.cit_half_year
    ADD CONSTRAINT cit_half_year_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: cit_reports cit_reports_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.cit_reports
    ADD CONSTRAINT cit_reports_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: compliance_settings compliance_settings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_settings
    ADD CONSTRAINT compliance_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: ecommerce_sales ecommerce_sales_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.ecommerce_sales
    ADD CONSTRAINT ecommerce_sales_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: ecommerce_sales ecommerce_sales_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.ecommerce_sales
    ADD CONSTRAINT ecommerce_sales_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.accounting_periods(id) ON DELETE CASCADE;


--
-- Name: employees employees_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: exchange_rates exchange_rates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: expense_details expense_details_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.expense_details
    ADD CONSTRAINT expense_details_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: expense_details expense_details_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.expense_details
    ADD CONSTRAINT expense_details_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.accounting_periods(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.accounting_periods(id) ON DELETE CASCADE;


--
-- Name: platform_imports platform_imports_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_imports
    ADD CONSTRAINT platform_imports_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: platform_imports platform_imports_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_imports
    ADD CONSTRAINT platform_imports_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.accounting_periods(id);


--
-- Name: platform_raw_orders platform_raw_orders_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_raw_orders
    ADD CONSTRAINT platform_raw_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: platform_raw_orders platform_raw_orders_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_raw_orders
    ADD CONSTRAINT platform_raw_orders_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.platform_imports(id) ON DELETE SET NULL;


--
-- Name: platform_raw_orders platform_raw_orders_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_raw_orders
    ADD CONSTRAINT platform_raw_orders_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.accounting_periods(id);


--
-- Name: pnd1_reports pnd1_reports_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pnd1_reports
    ADD CONSTRAINT pnd1_reports_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: pnd1_reports pnd1_reports_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pnd1_reports
    ADD CONSTRAINT pnd1_reports_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.accounting_periods(id) ON DELETE CASCADE;


--
-- Name: social_security_records social_security_records_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.social_security_records
    ADD CONSTRAINT social_security_records_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: social_security_records social_security_records_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.social_security_records
    ADD CONSTRAINT social_security_records_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: social_security_records social_security_records_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.social_security_records
    ADD CONSTRAINT social_security_records_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.accounting_periods(id) ON DELETE CASCADE;


--
-- Name: tax_calendar tax_calendar_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tax_calendar
    ADD CONSTRAINT tax_calendar_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: vat_compliance vat_compliance_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.vat_compliance
    ADD CONSTRAINT vat_compliance_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: vat_compliance vat_compliance_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.vat_compliance
    ADD CONSTRAINT vat_compliance_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.accounting_periods(id);


--
-- Name: vat_input_details vat_input_details_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.vat_input_details
    ADD CONSTRAINT vat_input_details_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: vat_input_details vat_input_details_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.vat_input_details
    ADD CONSTRAINT vat_input_details_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.accounting_periods(id) ON DELETE CASCADE;


--
-- Name: vat_output_details vat_output_details_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.vat_output_details
    ADD CONSTRAINT vat_output_details_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: vat_output_details vat_output_details_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.vat_output_details
    ADD CONSTRAINT vat_output_details_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.accounting_periods(id) ON DELETE CASCADE;


--
-- Name: vat_reports vat_reports_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.vat_reports
    ADD CONSTRAINT vat_reports_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: vat_reports vat_reports_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.vat_reports
    ADD CONSTRAINT vat_reports_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.accounting_periods(id) ON DELETE CASCADE;


--
-- Name: wht_details wht_details_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.wht_details
    ADD CONSTRAINT wht_details_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.wht_reports(id) ON DELETE CASCADE;


--
-- Name: wht_reports wht_reports_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.wht_reports
    ADD CONSTRAINT wht_reports_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: wht_reports wht_reports_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liuxiong
--

ALTER TABLE ONLY public.wht_reports
    ADD CONSTRAINT wht_reports_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.accounting_periods(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict qWlIoJ8qP61IU7x8ziUgv9epElQQ22Vx8QruDz9AbOYnPXfJISY057nFHZR0lPa

