interface NavCategoryButtonProps {
  label: string;
  isActive?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const NavCategoryButton = ({
  label,
  isActive = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: NavCategoryButtonProps) => {
  const baseClasses = `nav-button antialiased relative px-3 py-2 text-base font-semibold text-white duration-200 rounded-md ${
    isActive ? 'text-white active ' : 'text-white/100 hover:text-white '
  }`;

  return (
    <button type="button" onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className={baseClasses}>
      {label}
      <style jsx>{`
        .nav-button {
          position: relative;
        }
        .nav-button.active::after {
          content: '';
          position: absolute;
          bottom: -10px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 8px solid transparent;
          border-right: 8px solid transparent;
          border-top: 8px solid currentColor;
          animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </button>
  );
};
