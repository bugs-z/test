-- Add search vector columns to chats and messages tables
-- This migration only sets up search for NEW chats and messages

-- Create a function to truncate long words
CREATE OR REPLACE FUNCTION truncate_long_words(input_text TEXT)
RETURNS TEXT AS $$
DECLARE
    max_length INT := 1800; -- Safe limit below PostgreSQL's 2046 byte limit
    result TEXT := '';
    sanitized_text TEXT;
    current_word TEXT;
    words TEXT[];
    i INT;
BEGIN
    -- If input is null, return null
    IF input_text IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Limit the overall text length to prevent excessive processing
    IF length(input_text) > 100000 THEN
        input_text := substring(input_text, 1, 100000);
    END IF;
    
    -- Replace HTML tags and normalize whitespace
    sanitized_text := regexp_replace(input_text, '<[^>]*>', ' ', 'g');
    sanitized_text := regexp_replace(sanitized_text, '\s+', ' ', 'g');
    
    -- Split the text into words
    words := regexp_split_to_array(sanitized_text, '\s+');
    
    -- Process each word
    FOR i IN 1..array_length(words, 1) LOOP
        current_word := words[i];
        
        -- Skip empty words
        IF length(current_word) = 0 THEN
            CONTINUE;
        END IF;
        
        -- If the word is too long, truncate it
        IF length(current_word) > max_length THEN
            current_word := substring(current_word, 1, max_length);
        END IF;
        
        -- Add the word to the result
        IF i > 1 THEN
            result := result || ' ' || current_word;
        ELSE
            result := current_word;
        END IF;
    END LOOP;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add columns without the GENERATED ALWAYS clause
ALTER TABLE chats ADD COLUMN IF NOT EXISTS name_fts tsvector;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS content_fts tsvector;

-- Create indexes for both search vectors
CREATE INDEX IF NOT EXISTS chat_name_fts_idx ON chats USING gin (name_fts);
CREATE INDEX IF NOT EXISTS message_content_fts_idx ON messages USING gin (content_fts);

-- Create trigger functions to automatically update the search vectors for new records
CREATE OR REPLACE FUNCTION update_chat_name_fts()
RETURNS TRIGGER AS $$
BEGIN
    NEW.name_fts := to_tsvector('english', truncate_long_words(NEW.name));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_message_content_fts()
RETURNS TRIGGER AS $$
BEGIN
    NEW.content_fts := to_tsvector('english', truncate_long_words(NEW.content));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for new or updated records
CREATE TRIGGER chat_name_fts_trigger
BEFORE INSERT OR UPDATE OF name ON chats
FOR EACH ROW
EXECUTE FUNCTION update_chat_name_fts();

CREATE TRIGGER message_content_fts_trigger
BEFORE INSERT OR UPDATE OF content ON messages
FOR EACH ROW
EXECUTE FUNCTION update_message_content_fts();