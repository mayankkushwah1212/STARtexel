import { ProblemStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

/**
 * State transition graph for Problem challenges based on DESIGN.md specification.
 *
 * DRAFT -> PUBLISHED, CLOSED
 * PUBLISHED -> IN_REVIEW, CLOSED
 * IN_REVIEW -> PILOTING, PUBLISHED, CLOSED
 * PILOTING -> RESOLVED, CLOSED
 * RESOLVED -> CLOSED
 * CLOSED -> (Terminal: no further transitions permitted)
 */
export const VALID_PROBLEM_TRANSITIONS: Record<ProblemStatus, ProblemStatus[]> = {
  [ProblemStatus.DRAFT]: [ProblemStatus.PUBLISHED, ProblemStatus.CLOSED],
  [ProblemStatus.PUBLISHED]: [ProblemStatus.IN_REVIEW, ProblemStatus.CLOSED],
  [ProblemStatus.IN_REVIEW]: [ProblemStatus.PILOTING, ProblemStatus.PUBLISHED, ProblemStatus.CLOSED],
  [ProblemStatus.PILOTING]: [ProblemStatus.RESOLVED, ProblemStatus.CLOSED],
  [ProblemStatus.RESOLVED]: [ProblemStatus.CLOSED],
  [ProblemStatus.CLOSED]: [], // Terminal state
};

/**
 * Validates whether transitioning from currentStatus to newStatus is allowed.
 * Throws BadRequestException (400) if the transition is invalid.
 */
export function validateProblemTransition(
  currentStatus: ProblemStatus,
  newStatus: ProblemStatus,
): void {
  if (currentStatus === newStatus) {
    throw new BadRequestException(
      `Problem is already in '${currentStatus}' status. No transition needed.`,
    );
  }

  const allowed = VALID_PROBLEM_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    const allowedMsg =
      allowed.length > 0
        ? allowed.map((s) => `'${s}'`).join(', ')
        : 'None (Problem is in terminal CLOSED status)';
    throw new BadRequestException(
      `Invalid problem status transition from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowedMsg}.`,
    );
  }
}
