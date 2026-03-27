import * as React from 'react';
import { WelcomePopup } from './WelcomePopup';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  isNewUser?: boolean;
  onDonateClick: () => void;
}

/**
 * Deprecated compatibility wrapper.
 * --------------------------------------------------------------------------
 * The platform now uses `WelcomePopup` as the single canonical welcome surface
 * so support CTA logic, audio cadence, and popup frequency remain unified.
 */
export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  onClose,
  onDonateClick,
}) => {
  return (
    <WelcomePopup
      isOpen={isOpen}
      onClose={onClose}
      onSupport={onDonateClick}
    />
  );
};
