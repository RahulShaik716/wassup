export type CallMode = 'voice' | 'video';

export type CallPayload = {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  mode: CallMode;
};

export type CallState = CallPayload & {
  status: 'ringing' | 'incoming' | 'active';
};
