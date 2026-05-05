export type OutboundRecord = {
  recipientEmail: string;
  recipientName?: string;
  surveyCode: string;
  messageId: string;
  sentAt: string;
  subject: string;
};

export type ReplyRecord = {
  id: string;
  /** Message-ID của mail đến (trùng lặp khi poll lại) */
  inboundMessageId?: string;
  matchedOutboundMessageId?: string;
  matchedSurveyCode?: string;
  matchedRecipientEmail?: string;
  correlation: "message-id" | "subject-code" | "manual-unknown";
  fromAddress: string;
  subject: string;
  receivedAt: string;
  bodyTextPath?: string;
  bodyHtmlPath?: string;
  attachmentPaths: string[];
  uid?: number;
};
