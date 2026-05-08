import { create } from 'zustand';
import { Manager } from '@/../db/models';

type ManagerState = {
    manager: Manager,
    changeManager: (manager: Manager) => void
}

const defaultManager = new Manager();
defaultManager.id = 0;
defaultManager.name = 'preload manager';
defaultManager.clubId = 0;


export const useManager = create<ManagerState>((set) => ({
    manager: defaultManager,
    changeManager: (manager) => set({manager: manager})
}));
