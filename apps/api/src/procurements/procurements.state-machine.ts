import { ProcurementStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

/**
 * State transition graph for Public Procurement Contracts based on DESIGN.md specification.
 *
 * DRAFT -> PENDING_APPROVAL, TERMINATED
 * PENDING_APPROVAL -> APPROVED, DRAFT, TERMINATED
 * APPROVED -> CONTRACT_SIGNED, TERMINATED
 * CONTRACT_SIGNED -> FULFILLED, TERMINATED
 * FULFILLED -> (Terminal)
 * TERMINATED -> (Terminal)
 */
export const VALID_PROCUREMENT_TRANSITIONS: Record<ProcurementStatus, ProcurementStatus[]> = {
  [ProcurementStatus.DRAFT]: [ProcurementStatus.PENDING_APPROVAL, ProcurementStatus.TERMINATED],
  [ProcurementStatus.PENDING_APPROVAL]: [
    ProcurementStatus.APPROVED,
    ProcurementStatus.DRAFT,
    ProcurementStatus.TERMINATED,
  ],
  [ProcurementStatus.APPROVED]: [ProcurementStatus.CONTRACT_SIGNED, ProcurementStatus.TERMINATED],
  [ProcurementStatus.CONTRACT_SIGNED]: [ProcurementStatus.FULFILLED, ProcurementStatus.TERMINATED],
  [ProcurementStatus.FULFILLED]: [],  // Terminal state
  [ProcurementStatus.TERMINATED]: [], // Terminal state
};

/**
 * Validates whether transitioning a procurement contract from currentStatus to newStatus is allowed.
 * Throws BadRequestException (400) if the transition is invalid.
 */
export function validateProcurementTransition(
  currentStatus: ProcurementStatus,
  newStatus: ProcurementStatus,
): void {
  if (currentStatus === newStatus) {
    throw new BadRequestException(
      `Procurement contract is already in '${currentStatus}' status. No transition needed.`,
    );
  }

  const allowed = VALID_PROCUREMENT_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    const allowedMsg =
      allowed.length > 0
        ? allowed.map((s) => `'${s}'`).join(', ')
        : 'None (Contract is in a terminal status)';
    throw new BadRequestException(
      `Invalid procurement status transition from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowedMsg}.`,
    );
  }
}
