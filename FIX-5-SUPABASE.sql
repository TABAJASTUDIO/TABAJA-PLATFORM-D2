ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS feature_elements boolean DEFAULT false;
