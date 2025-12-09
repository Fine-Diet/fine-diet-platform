import React from 'react';

interface CategoryPageShellProps {
	children: React.ReactNode;
}

export const CategoryPageShell = ({ children }: CategoryPageShellProps) => {
	return (
		<div className="pt-[0px] pb-0">
			{children}
		</div>
	);
};


