import React from 'react';

interface CategoryPageShellProps {
	children: React.ReactNode;
}

export const CategoryPageShell = ({ children }: CategoryPageShellProps) => {
	return (
		<div className="pt-[110px] pb-20">
			{children}
		</div>
	);
};


