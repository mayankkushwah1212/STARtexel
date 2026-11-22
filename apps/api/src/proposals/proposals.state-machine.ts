import { ProposalStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

/**
 * State transition graph for Startup Proposals based on DESIGN.md specification.
 *
 * DRAFT -> SUBMITTED, WITHDRAWN
 * SUBMITTED -> UNDER_REVIEW, WITHDRAWN
 * UNDER_REVIEW -> SHORTLISTED, REJECTED, WITHDRAWN
 * SHORTLISTED -> ACCEPTED, REJECTED, WITHDRAWN
 * ACCEPTED -> WITHDRAWN
 * REJECTED -> (Terminal)
 * WITHDRAWN -> (Terminal)
 */
export const VALID_PROPOSAL_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  [ProposalStatus.DRAFT]: [ProposalStatus.SUBMITTED, ProposalStatus.WITHDRAWN],
  [ProposalStatus.SUBMITTED]: [ProposalStatus.UNDER_REVIEW, ProposalStatus.WITHDRAWN],
  [ProposalStatus.UNDER_REVIEW]: [ProposalStatus.SHORTLISTED, ProposalStatus.REJECTED, ProposalStatus.WITHDRAWN],
  [ProposalStatus.SHORTLISTED]: [ProposalStatus.ACCEPTED, ProposalStatus.REJECTED, ProposalStatus.WITHDRAWN],
  [ProposalStatus.ACCEPTED]: [ProposalStatus.WITHDRAWN],
  [ProposalStatus.REJECTED]: [], // Terminal state
  [ProposalStatus.WITHDRAWN]: [], // Terminal state
};

/**
 * Validates whether transitioning from currentStatus to newStatus is allowed.
 * Throws BadRequestException (400) if the transition is invalid.
 */
export function validateProposalTransition(
  currentStatus: ProposalStatus,
  newStatus: ProposalStatus,
): void {
  if (currentStatus === newStatus) {
    throw new BadRequestException(
      `Proposal is already in '${currentStatus}' status. No transition needed.`,
    );
  }

  const allowed = VALID_PROPOSAL_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    const allowedMsg =
      allowed.length > 0
        ? allowed.map((s) => `'${s}'`).join(', ')
        : 'None (Proposal is in a terminal status)';
    throw new BadRequestException(
      `Invalid proposal status transition from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowedMsg}.`,
    );
  }
}
