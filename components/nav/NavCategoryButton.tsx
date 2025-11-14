interface NavCategoryButtonProps {
  label: string;
  isActive?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
}

export const NavCategoryButton = ({
  label,
  isActive = false,
  onClick,
  onMouseEnter,
}: NavCategoryButtonProps) => {
  const baseClasses = `nav-button antialiased relative px-3 py-2 text-base font-semibold text-white duration-200 rounded-md ${
    isActive ? 'text-white active ' : 'text-white/100 hover:text-white '
  }`;

  return (
    <button type="button" onClick={onClick} onMouseEnter={onMouseEnter} className={baseClasses}>
      {label}
      <style jsx>{`
        .nav-button {
          position: relative;
        }
        .nav-button.active::after {
          content: '';
          position: absolute;
          bottom: -6px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 6px solid currentColor;
        }
      `}</style>
    </button>
  );
};
