import { EvaluationStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

/**
 * State transition graph for Evaluations based on DESIGN.md specification.
 *
 * DRAFT -> SUBMITTED
 * SUBMITTED -> FINALIZED
 * FINALIZED -> (Terminal: no further transitions permitted)
 */
export const VALID_EVALUATION_TRANSITIONS: Record<EvaluationStatus, EvaluationStatus[]> = {
  [EvaluationStatus.DRAFT]: [EvaluationStatus.SUBMITTED],
  [EvaluationStatus.SUBMITTED]: [EvaluationStatus.FINALIZED],
  [EvaluationStatus.FINALIZED]: [], // Terminal state
};

/**
 * Validates whether transitioning an evaluation from currentStatus to newStatus is allowed.
 * Throws BadRequestException (400) if the transition is invalid.
 */
export function validateEvaluationTransition(
  currentStatus: EvaluationStatus,
  newStatus: EvaluationStatus,
): void {
  if (currentStatus === newStatus) {
    throw new BadRequestException(
      `Evaluation is already in '${currentStatus}' status. No transition needed.`,
    );
  }

  const allowed = VALID_EVALUATION_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    const allowedMsg =
      allowed.length > 0
        ? allowed.map((s) => `'${s}'`).join(', ')
        : 'None (Evaluation is in terminal FINALIZED status)';
    throw new BadRequestException(
      `Invalid evaluation status transition from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowedMsg}.`,
    );
  }
}
