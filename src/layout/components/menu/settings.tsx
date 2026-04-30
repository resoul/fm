import {save, upload} from "@/lib/utils/dump";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import React, { useRef, useState } from 'react';
import ProgressBar from "@/components/progress-bar";
import { useNavigate } from "react-router-dom";

export default function Settings() {

	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isImporting, setIsImporting] = useState(false);
	const [progress, setProgress] = useState(0);
	const navigate = useNavigate();

	const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const files = event.target.files;
		if (!files || files.length === 0) return;

		const file = files[0];
		setIsImporting(true);


		try {
			await upload(file, setProgress);

			alert('Load successful!');
			navigate('/');
		} catch (err) {
			console.error('TS Import Error:', err);
			alert('Error importing data.');
		} finally {
			setIsImporting(false);
			setProgress(0);
			if (fileInputRef.current) {
				fileInputRef.current.value = '';
			}
		}
	};

	const handleLinkClick = (e: React.MouseEvent<HTMLDivElement>) => {
		e.preventDefault();
		if (!isImporting && fileInputRef.current) {
			fileInputRef.current.click();
		}
	};


	return (<>
		{isImporting && <ProgressBar progress={progress} />}

		<input
				type="file"
				ref={fileInputRef}
				onChange={handleFileChange}
				accept="application/json"
				style={{ display: 'none' }}
			/>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				FM
			</DropdownMenu.Trigger>
			<DropdownMenu.Content>
				<DropdownMenu.Item onClick={save}>Save</DropdownMenu.Item>
				<DropdownMenu.Item onClick={handleLinkClick}>
					Load
				</DropdownMenu.Item>
				<DropdownMenu.Item>Settings</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item color="red">
					Exit
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</>);


}