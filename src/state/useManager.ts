import { create } from 'zustand';

type ManagerType = {
    id: number,
    clubId: number,
    name: string
}

type ManagerState = {
    manager: ManagerType,
    changeManager: (manager: ManagerType) => void
}

export const useManager = create<ManagerState>((set) => ({
    manager: {id: 0, clubId: 0, name: 'preload manager'},
    changeManager: (manager) => set({manager: manager})
}));
