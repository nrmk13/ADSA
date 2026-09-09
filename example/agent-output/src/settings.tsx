// What an agent produced against @acme/ui before the system was made agent-ready.
// Kept in the repo as the "round one" side of the experiment.
import { Button } from "@acme/ui/button";
import { Card, CardHeader, CardBody } from "@acme/ui/card";
import { Input } from "@acme/ui/input";
import { PageHeader } from "@acme/ui/page-header";
import { FormRow, Toggle } from "@acme/ui/form";
import { Settings } from "lucide-react";

export const SettingsPage = () => (
    <div className="bg-gray-50 text-slate-900">
        <PageHeader title="Settings" icon={<Settings />} />
        <Card elevated>
            <CardHeader>Profile</CardHeader>
            <CardBody>
                <FormRow>
                    <Input label="Full name" />
                </FormRow>
                <FormRow>
                    <Toggle label="Email me about product updates" />
                </FormRow>
                <Button color="primary">Save changes</Button>
            </CardBody>
        </Card>
    </div>
);
