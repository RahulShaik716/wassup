export function buildChatId(firstUserId: string, secondUserId: string) {
    return [firstUserId, secondUserId].sort().join('--');
  }