import { useState } from 'react';
import { MessageSquareReply, Send, X } from 'lucide-react';
import { CHAT_REACTION_EMOJIS } from '@/chat/seed';
import { resolveChatUser, useChatStore } from '@/chat/store';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { MessageCard } from './MessageCard';

export function ThreadDrawer({
  currentUserId,
  onSelectChannel,
}: {
  currentUserId: string;
  onSelectChannel: (channelId: string) => void;
}) {
  const threadMessageId = useChatStore((s) => s.threadMessageId);
  const messages = useChatStore((s) => s.messages);
  const channels = useChatStore((s) => s.channels);
  const openThread = useChatStore((s) => s.openThread);
  const replyInThread = useChatStore((s) => s.replyInThread);
  const toggleReplyReaction = useChatStore((s) => s.toggleReplyReaction);

  const [replyText, setReplyText] = useState('');

  if (!threadMessageId) return null;

  const parentMessage = messages.find((m) => m.id === threadMessageId);
  if (!parentMessage) return null;

  const channel = channels.find((c) => c.id === parentMessage.channelId);

  const handleSendReply = () => {
    if (!replyText.trim()) return;
    replyInThread(parentMessage.id, replyText);
    setReplyText('');
  };

  return (
    <aside className="chat-thread-drawer" aria-label="Message thread drawer">
      <header className="chat-thread-drawer__head">
        <div className="row row--sm">
          <MessageSquareReply size={17} />
          <div>
            <div className="chat-thread-drawer__title">Thread</div>
            <div className="chat-thread-drawer__sub">
              {channel?.kind === 'dm' ? channel.name : `#${channel?.name ?? 'general'}`} ·{' '}
              {parentMessage.replies.length}{' '}
              {parentMessage.replies.length === 1 ? 'reply' : 'replies'}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          onClick={() => openThread(null)}
          aria-label="Close thread drawer"
        >
          <X size={16} />
        </button>
      </header>

      <div className="chat-thread-drawer__body">
        <div className="chat-thread-drawer__parent">
          <MessageCard
            message={parentMessage}
            currentUserId={currentUserId}
            onSelectChannel={onSelectChannel}
            compact
          />
        </div>

        <div className="chat-thread-drawer__divider">
          <span>
            {parentMessage.replies.length}{' '}
            {parentMessage.replies.length === 1 ? 'Reply' : 'Replies'}
          </span>
        </div>

        <div className="chat-thread-drawer__replies">
          {parentMessage.replies.length === 0 ? (
            <p className="muted text-sm" style={{ padding: '12px 4px' }}>
              No replies yet — start the conversation below!
            </p>
          ) : (
            parentMessage.replies.map((reply) => {
              const rUser = resolveChatUser(reply.authorId);
              const rReactions = Object.entries(reply.reactions).filter(([, ids]) => ids.length > 0);
              return (
                <div key={reply.id} className="chat-thread-reply">
                  <Avatar user={rUser} size={30} presence />
                  <div className="chat-thread-reply__content">
                    <div className="chat-thread-reply__meta">
                      <strong>{rUser.name}</strong>
                      <span className="muted text-xs">{rUser.title}</span>
                      <span className="muted text-xs">{relativeTime(reply.createdAt)}</span>
                    </div>
                    <div className="chat-thread-reply__body">{reply.body}</div>
                    <div className="chat-thread-reply__reactions">
                      {rReactions.map(([em, ids]) => (
                        <button
                          key={em}
                          type="button"
                          className={cx('chat-reaction-chip', ids.includes(currentUserId) && 'is-mine')}
                          onClick={() => toggleReplyReaction(parentMessage.id, reply.id, em)}
                        >
                          <span>{em}</span>
                          <span className="mono">{ids.length}</span>
                        </button>
                      ))}
                      <div className="chat-thread-reply__quick-react">
                        {CHAT_REACTION_EMOJIS.slice(0, 4).map((em) => (
                          <button
                            key={em}
                            type="button"
                            className="chat-thread-reply__react-btn"
                            onClick={() => toggleReplyReaction(parentMessage.id, reply.id, em)}
                            title={`React ${em}`}
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <footer className="chat-thread-drawer__composer">
        <textarea
          className="textarea chat-thread-drawer__textarea"
          rows={2}
          placeholder={`Reply to ${resolveChatUser(parentMessage.authorId).name.split(' ')[0]} in thread…`}
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendReply();
            }
          }}
        />
        <div className="row row--between">
          <span className="muted text-xs">Press Enter to send</span>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={handleSendReply}
            disabled={!replyText.trim()}
          >
            <Send size={13} />
            <span>Reply in Thread</span>
          </button>
        </div>
      </footer>
    </aside>
  );
}
