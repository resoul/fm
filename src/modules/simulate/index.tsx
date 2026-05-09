import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from "@/layout";
import { SectionLayout } from "@/layout/components/section-layout";
import { getMenuItems } from "./layout/menus";
import { SimulatePage } from "./pages/simulate/page";

export default function SimulateModule() {
    return (
        <Routes>
            <Route element={<Layout />}>
                <Route element={<SectionLayout menu={getMenuItems()}/>}>
                    <Route index element={<Navigate to="simulate" replace />} />

                    <Route path="simulate" element={<SimulatePage />} />
                </Route>
            </Route>
        </Routes>
    )
}
