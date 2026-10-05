import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useGuardianStore } from '@/store/guardianStore';
import { apiFetch, getReportFileUrl } from '@/lib/api';
import { FileText, Download, Calendar, User, ShieldCheck, Eye, RefreshCw } from 'lucide-react';

interface ClinicalReport {
  id: string;
  elderId: string;
  doctorId: string;
  doctorName: string;
  title: string;
  description: string;
  category: string;
  fileUrl: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  createdAt: string;
}

const ReportsTab: React.FC = () => {
  const { guardianUser } = useGuardianStore();
  const [reports, setReports] = useState<ClinicalReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState<ClinicalReport | null>(null);
  const [elderId, setElderId] = useState<string>('');

  const elderName = guardianUser?.elderName || 'Registered elder';

  const loadReports = async () => {
    setLoading(true);
    try {
      // Find assigned elder ID from dashboard-data or elders API
      const dashboard = await apiFetch<any>('/dashboard-data').catch(() => null);
      let targetElderId = '';
      if (dashboard?.elders?.length) {
        const matched = dashboard.elders.find(
          (e: any) => e.full_name?.toLowerCase().trim() === elderName.toLowerCase().trim()
        );
        targetElderId = matched ? matched.id : dashboard.elders[0].id;
      } else {
        const eldersList = await apiFetch<any[]>('/elders').catch(() => []);
        if (eldersList.length) {
          const matched = eldersList.find(
            (e: any) => e.full_name?.toLowerCase().trim() === elderName.toLowerCase().trim()
          );
          targetElderId = matched ? matched.id : eldersList[0].id;
        }
      }

      if (!targetElderId) {
        targetElderId = 'elder-1';
      }
      setElderId(targetElderId);

      const data = await apiFetch<ClinicalReport[]>(`/reports?elderId=${targetElderId}`);
      setReports(Array.isArray(data) ? data : []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [elderName]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-teal" /> Medical Records & Clinical Reports
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Verified checkup documents and diagnostic reports for <strong className="text-foreground">{elderName}</strong> uploaded by doctors.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadReports}
          disabled={loading}
          className="border-teal/30 text-teal hover:bg-teal/5 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-sm text-muted-foreground bg-muted/20 rounded-xl border border-border/50">
          <RefreshCw className="h-6 w-6 text-teal animate-spin mx-auto mb-2" />
          Loading medical reports...
        </div>
      ) : reports.length === 0 ? (
        <Card className="rounded-xl border border-dashed border-border p-8 text-center bg-card">
          <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-semibold text-foreground text-base">No Medical Records Uploaded Yet</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            When doctors or clinical specialists upload verified lab reports, ECGs, prescriptions, or discharge summaries for {elderName}, they will appear here securely.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reports.map((report) => (
            <Card key={report.id} className="rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <Badge className="bg-secondary text-teal hover:bg-secondary border-0 text-[10px]">
                    {report.category}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(report.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <CardTitle className="font-display text-base font-semibold text-foreground mt-2">
                  {report.title}
                </CardTitle>
                <CardDescription className="text-xs flex items-center gap-1 text-muted-foreground mt-0.5">
                  <User className="h-3 w-3 text-teal" /> Dr. {report.doctorName || 'Clinical Doctor'}
                </CardDescription>
              </CardHeader>

              <CardContent className="p-4 pt-2 space-y-3">
                {report.description ? (
                  <p className="text-xs text-muted-foreground line-clamp-2 bg-muted/30 p-2 rounded-lg border border-border/40">
                    {report.description}
                  </p>
                ) : null}

                <div className="flex items-center justify-between pt-2 border-t border-border/40 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 px-2.5 text-foreground hover:bg-secondary/40"
                    onClick={() => setActiveReport(report)}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" /> View Details
                  </Button>

                  <a
                    href={getReportFileUrl(report.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal text-primary-foreground hover:bg-teal/90 transition-colors shadow-sm"
                  >
                    <FileText className="h-3.5 w-3.5" /> Open PDF
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Details Dialog */}
      {activeReport && (
        <Dialog open={activeReport !== null} onOpenChange={(open) => { if (!open) setActiveReport(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-secondary text-teal border-0 text-xs">{activeReport.category}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(activeReport.createdAt).toLocaleString()}
                </span>
              </div>
              <DialogTitle className="font-display text-lg text-foreground">{activeReport.title}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Verified medical report authorized by {activeReport.doctorName || 'Attending Physician'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div className="p-3 bg-muted/40 rounded-xl space-y-1 border border-border/60">
                <span className="font-semibold text-muted-foreground block text-[11px] uppercase tracking-wider">
                  Findings & Clinical Notes
                </span>
                <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                  {activeReport.description || 'No additional remarks provided.'}
                </p>
              </div>

              <div className="flex items-center justify-between p-3 bg-secondary/20 rounded-xl border border-teal/20">
                <div className="flex items-center gap-2 overflow-hidden">
                  <ShieldCheck className="h-5 w-5 text-teal shrink-0" />
                  <div className="overflow-hidden">
                    <p className="font-medium text-foreground truncate">{activeReport.fileName || activeReport.fileUrl || 'clinical_document.pdf'}</p>
                    <p className="text-[10px] text-muted-foreground">Authentic verified checkup document</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <a
                  href={getReportFileUrl(activeReport.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-teal text-primary-foreground hover:bg-teal/90 transition-colors shadow-sm"
                >
                  <FileText className="h-4 w-4" /> Open Document in New Tab
                </a>
                <Button variant="outline" size="sm" onClick={() => setActiveReport(null)}>
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default ReportsTab;
