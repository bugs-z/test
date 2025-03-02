-- Add search vector for chat names
ALTER TABLE chats 
ADD COLUMN name_fts tsvector 
GENERATED ALWAYS AS (to_tsvector('english', name)) STORED;

-- Add search vector for messages
ALTER TABLE messages 
ADD COLUMN content_fts tsvector 
GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- Create indexes for both search vectors
CREATE INDEX chat_name_fts_idx ON chats USING gin (name_fts);
CREATE INDEX message_content_fts_idx ON messages USING gin (content_fts);