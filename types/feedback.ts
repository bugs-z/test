export type Feedback = {
  message_id: string;
  user_id: string;
  chat_id: string;
  feedback: 'good' | 'bad';
  reason?: string;
  detailed_feedback?: string;
  model: string;
  updated_at: number;
  sequence_number: number;
  allow_email?: boolean;
  allow_sharing?: boolean;
  has_files: boolean;
  plugin: string;
};
