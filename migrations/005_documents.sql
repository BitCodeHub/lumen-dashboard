-- Documents table for file uploads (PDFs, images, etc.)
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    title VARCHAR(500),
    section VARCHAR(100) DEFAULT 'General', -- e.g., 'Applause', 'Research', 'Reports'
    category VARCHAR(100), -- e.g., 'Research', 'Analysis', 'Presentation'
    file_path TEXT NOT NULL,
    file_size INTEGER, -- bytes
    mime_type VARCHAR(100),
    tags TEXT[], -- Array of tags
    description TEXT,
    metadata JSONB, -- Additional metadata
    uploaded_by VARCHAR(255),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    starred BOOLEAN DEFAULT FALSE,
    archived BOOLEAN DEFAULT FALSE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_section ON documents(section);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_tags ON documents USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_starred ON documents(starred) WHERE starred = TRUE;

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_updated_at_trigger
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_documents_updated_at();

COMMENT ON TABLE documents IS 'File uploads and document management';
COMMENT ON COLUMN documents.section IS 'Dashboard section (e.g., Applause, Research, Reports)';
COMMENT ON COLUMN documents.tags IS 'Searchable tags array';
