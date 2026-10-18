import React from 'react';

/**
 * Fail-closed member state. No lesson bodies and no progress actions.
 */
export function MemberBlueprintUnavailable() {
  return (
    <section role="alert" className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-normal text-[#17100c]">
        This Program version is unavailable
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#17100c]/80">
        Enrollment, publication, and content do not agree, so its lessons and
        actions are not shown.
      </p>
    </section>
  );
}
