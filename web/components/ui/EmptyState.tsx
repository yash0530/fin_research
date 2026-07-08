import React from "react";

interface Action {
  label: string;
  onClick?: () => void;
  href?: string;
  shortcut?: string;
}

interface EmptyStateProps {
  title: string;
  body: string;
  actions?: Action[];
  className?: string;
}

export function EmptyState({ title, body, actions = [], className = "" }: EmptyStateProps) {
  return (
    <div className={`empty-state-card ${className}`}>
      <div className="ui-emptystate-icon">[!]</div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-body">{body}</p>
      {actions.length > 0 && (
        <div className="ui-emptystate-actions-container">
          <div className="ui-emptystate-actions-header">Quick Actions:</div>
          {actions.map((act, idx) => (
            <div key={idx} className="flex items-center justify-center gap-2">
              {act.href ? (
                <a
                  href={act.href}
                  className="ui-emptystate-action-link"
                >
                  {act.label}
                </a>
              ) : (
                <button
                  onClick={act.onClick}
                  className="ui-emptystate-action-link"
                >
                  {act.label}
                </button>
              )}
              {act.shortcut && (
                <span className="ui-emptystate-shortcut">
                  [Press {act.shortcut}]
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
