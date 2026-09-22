-- Oppningar av ett formular, for trattanalysen i /forms/progressbild.
-- Datum: 2026-09-22
--
-- Varfor en egen tabell och inte pixel_events: den ar bunden till Meta CAPI och
-- besoksattribuering, och en QR-oppning har varken en fbclid eller ett kop att
-- attribuera. Den har ar medvetet tunn.
--
-- Vi raknar OPPNINGAR, inte scanningar. En QR-kod som scannas men aldrig tappas
-- gor ingen natverksforfragan alls - telefonens kamera visar bara en banner - sa
-- den sortens scan gar inte att rakna fran nagon server. Kolumnen heter darfor
-- det den ar.
CREATE TABLE IF NOT EXISTS form_opens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  market text NOT NULL DEFAULT 'se',
  -- Var hon kom ifran: 'qr' fran kortet i paketet, 'mail' fran en lank i ett
  -- utskick, 'direkt' nar inget sags. Styrs av ?k= pa vardsidan.
  kalla text NOT NULL DEFAULT 'direkt',
  -- Vilket steg sidan oppnades for (1/2/3), sa dag 30 och dag 60 gar att skilja
  -- fran dag 1 i tratten.
  steg text,
  -- Slumpad id i webblasarens sessionStorage. Finns for att kunna rakna unika
  -- oppningar utan att lagra IP, adress eller nagot annat om personen.
  besokare text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS form_opens_form_idx ON form_opens (form_id, created_at DESC);
CREATE INDEX IF NOT EXISTS form_opens_besokare_idx ON form_opens (form_id, besokare);

ALTER TABLE form_opens ENABLE ROW LEVEL SECURITY;
