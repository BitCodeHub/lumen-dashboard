-- SEO Reports Table
CREATE TABLE IF NOT EXISTS seo_reports (
    id SERIAL PRIMARY KEY,
    website_url TEXT NOT NULL,
    website_name TEXT NOT NULL,
    
    -- Scores
    overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
    technical_score INTEGER CHECK (technical_score >= 0 AND technical_score <= 100),
    onpage_score INTEGER CHECK (onpage_score >= 0 AND onpage_score <= 100),
    content_score INTEGER CHECK (content_score >= 0 AND content_score <= 100),
    ux_score INTEGER CHECK (ux_score >= 0 AND ux_score <= 100),
    mobile_score INTEGER CHECK (mobile_score >= 0 AND mobile_score <= 100),
    
    -- Files
    pdf_path TEXT,
    html_path TEXT,
    markdown_path TEXT,
    
    -- Findings
    critical_issues INTEGER DEFAULT 0,
    warnings INTEGER DEFAULT 0,
    recommendations INTEGER DEFAULT 0,
    
    -- Metadata
    audited_by TEXT DEFAULT 'Lumen AI SEO Analyst',
    audit_date TIMESTAMP NOT NULL DEFAULT NOW(),
    next_audit_date TIMESTAMP,
    
    -- Status
    status TEXT DEFAULT 'completed' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'failed')),
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_seo_reports_website ON seo_reports(website_url);
CREATE INDEX IF NOT EXISTS idx_seo_reports_date ON seo_reports(audit_date DESC);
CREATE INDEX IF NOT EXISTS idx_seo_reports_status ON seo_reports(status);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_seo_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER seo_reports_updated_at
    BEFORE UPDATE ON seo_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_seo_reports_updated_at();

-- Sample data comment (not executed)
-- INSERT INTO seo_reports (website_url, website_name, overall_score, technical_score, onpage_score, content_score, ux_score, mobile_score, pdf_path, audit_date)
-- VALUES ('https://owners.genesis.com', 'MyGenesis Owner Portal', 52, 45, 55, 40, 70, 65, '/path/to/genesis.pdf', '2026-01-27 02:09:00');
