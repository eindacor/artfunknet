"use client";

import {
  Children,
  Fragment,
  isValidElement,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from "react";

type GroupableActionProps = {
  children?: ReactNode;
  destructive?: boolean;
};

export default function ItemActionLayout({
  actions,
  artStyleAction,
  className = "",
  onClick,
  primaryAction,
}: {
  actions?: ReactNode;
  artStyleAction?: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
  primaryAction?: ReactNode;
}) {
  const { destructive, nonDestructive } = partitionActions(actions);
  if (
    !primaryAction &&
    nonDestructive.length === 0 &&
    destructive.length === 0 &&
    !artStyleAction
  ) {
    return null;
  }

  return (
    <div
      className={`${className} card-actions${
        primaryAction ? " card-actions-with-primary" : ""
      }`.trim()}
      onClick={onClick}
    >
      {primaryAction ? (
        <section
          aria-label="Main action"
          className="card-action-main card-action-primary"
        >
          {primaryAction}
        </section>
      ) : null}
      <div className="card-action-groups">
        <section
          aria-label="Non-destructive actions"
          className="card-action-section card-action-nondestructive"
        >
          {nonDestructive}
          {artStyleAction}
        </section>
        <section
          aria-label="Destructive actions"
          className="card-action-section card-action-destructive"
        >
          {destructive}
        </section>
      </div>
    </div>
  );
}

function partitionActions(actions: ReactNode): {
  destructive: ReactNode[];
  nonDestructive: ReactNode[];
} {
  const groups = {
    destructive: [] as ReactNode[],
    nonDestructive: [] as ReactNode[],
  };

  function visit(children: ReactNode) {
    Children.forEach(children, (child) => {
      if (
        isValidElement<GroupableActionProps>(child) &&
        child.type === Fragment
      ) {
        visit(child.props.children);
        return;
      }
      if (
        isValidElement<GroupableActionProps>(child) &&
        child.props.destructive
      ) {
        groups.destructive.push(child as ReactElement<GroupableActionProps>);
      } else if (child !== null && child !== undefined && child !== false) {
        groups.nonDestructive.push(child);
      }
    });
  }

  visit(actions);
  return groups;
}
