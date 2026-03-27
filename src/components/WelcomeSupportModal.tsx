import * as React from 'react';
import { WelcomePopup } from './WelcomePopup';

interface WelcomeSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  onDonateClick: () => void;
}

/**
 * Deprecated compatibility wrapper.
 * --------------------------------------------------------------------------
 * This now delegates to the shared welcome popup so the platform never stacks
 * multiple welcome/support overlays with overlapping responsibilities.
 */
export const WelcomeSupportModal: React.FC<WelcomeSupportModalProps> = ({
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
