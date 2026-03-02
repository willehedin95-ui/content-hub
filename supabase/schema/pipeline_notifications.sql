-- Pipeline Notifications Table
-- Tracks sent notifications to avoid duplicates

CREATE TABLE pipeline_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  concept_id UUID REFERENCES pipeline_concepts(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'concepts_ready',
    'images_complete',
    'performance_alert'
  )),
  channel TEXT NOT NULL CHECK (channel IN ('telegram', 'in_app', 'email')),

  sent_at TIMESTAMPTZ DEFAULT NOW(),
  telegram_message_id TEXT,

  metadata JSONB
);

-- Indexes
CREATE INDEX idx_pipeline_notifications_concept ON pipeline_notifications(concept_id);
CREATE INDEX idx_pipeline_notifications_type ON pipeline_notifications(notification_type);
CREATE INDEX idx_pipeline_notifications_sent ON pipeline_notifications(sent_at DESC);

-- RLS
ALTER TABLE pipeline_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for service role"
  ON pipeline_notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
