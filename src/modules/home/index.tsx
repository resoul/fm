import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from "@/layout";
import { SectionLayout } from "@/layout/components/section-layout";
import { getMenuItems } from "./layout/menus";
import { Page } from "./pages/home/page";
import { useManager } from '@/hooks/useManager';

export default function HomeModule() {

    const { isLoading: isManagerLoading } = useManager();

    if (isManagerLoading) return <>Loading...</>

    return (
        <Routes>
            <Route element={<Layout />}>
                <Route element={<SectionLayout menu={getMenuItems()}/>}>
                    <Route index element={<Navigate to="home" replace />} />

                    <Route path="home" element={<Page />} />
                    <Route path="notebook" element={<Page />} />
                    <Route path="promises" element={<Page />} />
                    <Route path="resign" element={<Page />} />
                    <Route path="contract-offer" element={<Page />} />
                    <Route path="contract-details" element={<Page />} />
                    <Route path="overview" element={<Page />} />
                    <Route path="job-history" element={<Page />} />
                    <Route path="profile" element={<Page />} />
                    <Route path="my-manager-timeline" element={<Page />} />
                    <Route path="start-course" element={<Page />} />
                    <Route path="retire" element={<Page />} />
                    <Route path="relationships" element={<Page />} />
                    <Route path="biography" element={<Page />} />
                    <Route path="press-conferences" element={<Page />} />
                    <Route path="keep-history-after-retirement" element={<Page />} />
                    <Route path="go-on-holiday" element={<Page />} />
                </Route>
            </Route>
        </Routes>
    )
}
