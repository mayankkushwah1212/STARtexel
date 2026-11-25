import { PilotStatus, MilestoneStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

/**
 * State transition graph for Pilots based on DESIGN.md specification.
 *
 * INITIATED -> IN_PROGRESS, PAUSED, FAILED
 * IN_PROGRESS -> PAUSED, COMPLETED, FAILED, GRADUATED
 * PAUSED -> IN_PROGRESS, FAILED
 * COMPLETED -> GRADUATED, FAILED
 * GRADUATED -> (Terminal: eligible for direct procurement award)
 * FAILED -> (Terminal)
 */
export const VALID_PILOT_TRANSITIONS: Record<PilotStatus, PilotStatus[]> = {
  [PilotStatus.INITIATED]: [PilotStatus.IN_PROGRESS, PilotStatus.PAUSED, PilotStatus.FAILED],
  [PilotStatus.IN_PROGRESS]: [PilotStatus.PAUSED, PilotStatus.COMPLETED, PilotStatus.FAILED, PilotStatus.GRADUATED],
  [PilotStatus.PAUSED]: [PilotStatus.IN_PROGRESS, PilotStatus.FAILED],
  [PilotStatus.COMPLETED]: [PilotStatus.GRADUATED, PilotStatus.FAILED],
  [PilotStatus.GRADUATED]: [], // Terminal state
  [PilotStatus.FAILED]: [],    // Terminal state
};

/**
 * Validates whether transitioning a pilot from currentStatus to newStatus is allowed.
 * Throws BadRequestException (400) if the transition is invalid.
 */
export function validatePilotTransition(
  currentStatus: PilotStatus,
  newStatus: PilotStatus,
): void {
  if (currentStatus === newStatus) {
    throw new BadRequestException(
      `Pilot is already in '${currentStatus}' status. No transition needed.`,
    );
  }

  const allowed = VALID_PILOT_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    const allowedMsg =
      allowed.length > 0
        ? allowed.map((s) => `'${s}'`).join(', ')
        : 'None (Pilot is in a terminal status)';
    throw new BadRequestException(
      `Invalid pilot status transition from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowedMsg}.`,
    );
  }
}

/**
 * State transition graph for Milestones.
 *
 * PENDING -> IN_PROGRESS, DELAYED
 * IN_PROGRESS -> SUBMITTED, DELAYED
 * SUBMITTED -> VERIFIED, REJECTED, IN_PROGRESS
 * VERIFIED -> (Terminal: deliverable validated and accepted)
 * REJECTED -> IN_PROGRESS (allow revision and re-submission)
 * DELAYED -> IN_PROGRESS, PENDING
 */
export const VALID_MILESTONE_TRANSITIONS: Record<MilestoneStatus, MilestoneStatus[]> = {
  [MilestoneStatus.PENDING]: [MilestoneStatus.IN_PROGRESS, MilestoneStatus.SUBMITTED, MilestoneStatus.DELAYED],
  [MilestoneStatus.IN_PROGRESS]: [MilestoneStatus.SUBMITTED, MilestoneStatus.DELAYED],
  [MilestoneStatus.SUBMITTED]: [MilestoneStatus.VERIFIED, MilestoneStatus.REJECTED, MilestoneStatus.IN_PROGRESS],
  [MilestoneStatus.VERIFIED]: [], // Terminal state
  [MilestoneStatus.REJECTED]: [MilestoneStatus.IN_PROGRESS, MilestoneStatus.SUBMITTED],
  [MilestoneStatus.DELAYED]: [MilestoneStatus.IN_PROGRESS, MilestoneStatus.PENDING],
};

/**
 * Validates whether transitioning a milestone from currentStatus to newStatus is allowed.
 * Throws BadRequestException (400) if the transition is invalid.
 */
export function validateMilestoneTransition(
  currentStatus: MilestoneStatus,
  newStatus: MilestoneStatus,
): void {
  if (currentStatus === newStatus) {
    throw new BadRequestException(
      `Milestone is already in '${currentStatus}' status. No transition needed.`,
    );
  }

  const allowed = VALID_MILESTONE_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    const allowedMsg =
      allowed.length > 0
        ? allowed.map((s) => `'${s}'`).join(', ')
        : 'None (Milestone is in a terminal status)';
    throw new BadRequestException(
      `Invalid milestone status transition from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowedMsg}.`,
    );
  }
}
