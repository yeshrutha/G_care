import React, { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useGuardianStore, type Reminder } from '@/store/guardianStore';
import { triggerAlert } from '@/lib/audioAlerts';
import { formatTime12Hour, from12HourParts, to12HourParts, type TimeParts12Hour } from '@/lib/timeFormat';
import { Pill, UtensilsCrossed, Dumbbell, Calendar, Plus, Camera, Check, Clock, Video, Trash2, Pencil } from 'lucide-react';

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

type ReminderFormState = {
  title: string;
  time: string;
  repeat: Reminder['repeat'];
  pillName: string;
  dosage: string;
  photo: string;
  mealType: string;
  routineDescription: string;
  videoUrl: string;
  doctorName: string;
  hospitalName: string;
  appointmentDate: string;
};

const DEFAULT_FORM: ReminderFormState = {
  title: '',
  time: '08:00',
  repeat: 'daily',
  pillName: '',
  dosage: '',
  photo: '',
  mealType: 'Breakfast',
  routineDescription: '',
  videoUrl: '',
  doctorName: '',
  hospitalName: '',
  appointmentDate: '',
};

function buildFormFromReminder(reminder?: Reminder): ReminderFormState {
  if (!reminder) {
    return { ...DEFAULT_FORM };
  }

  return {
    title: reminder.title || '',
    time: reminder.time || '08:00',
    repeat: reminder.repeat || 'daily',
    pillName: reminder.pillName || '',
    dosage: reminder.dosage || '',
    photo: reminder.photo || '',
    mealType: reminder.mealType || 'Breakfast',
    routineDescription: reminder.routineDescription || '',
    videoUrl: reminder.videoUrl || '',
    doctorName: reminder.doctorName || '',
    hospitalName: reminder.hospitalName || '',
    appointmentDate: reminder.appointmentDate || '',
  };
}

const ReminderCard: React.FC<{ reminder: Reminder; onVerify: () => void; onDelete: () => void; onEdit: () => void }> = ({ reminder, onVerify, onDelete, onEdit }) => {
  const iconMap: Record<string, React.ReactNode> = {
    medication: <Pill className="h-5 w-5 text-teal" />,
    food: <UtensilsCrossed className="h-5 w-5 text-gw-amber" />,
    activity: <Dumbbell className="h-5 w-5 text-gw-purple" />,
    appointment: <Calendar className="h-5 w-5 text-blue-500" />,
  };

  return (
    <Card className={`rounded-xl transition-all ${reminder.verified ? 'opacity-60 border-gw-green/30' : ''}`}>
      <CardContent className="p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
          {iconMap[reminder.type]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-foreground text-sm truncate">{reminder.title}</span>
            <Badge variant="outline" className="text-[10px] shrink-0">{reminder.type}</Badge>
            {reminder.verified && <Badge className="text-[10px] bg-gw-green text-primary-foreground">Verified ✓</Badge>}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime12Hour(reminder.time)}</span>
            <span>{reminder.repeat}</span>
            {reminder.dosage && <span>{reminder.dosage}</span>}
            {reminder.doctorName && <span>{reminder.doctorName}</span>}
            {reminder.appointmentDate && <span>{reminder.appointmentDate}</span>}
            {reminder.hospitalName && <span className="truncate">{reminder.hospitalName}</span>}
          </div>
          {reminder.photo && (
            <img src={reminder.photo} alt="pill" className="w-16 h-16 rounded-lg object-cover mt-2 border border-border" />
          )}
          {reminder.videoUrl && (
            <div className="flex items-center gap-1 mt-1 text-xs text-gw-purple">
              <Video className="h-3 w-3" /> Video attached
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <Button size="sm" variant="ghost" className="text-xs h-7 text-muted-foreground" onClick={onEdit}>
            <Pencil className="h-3 w-3" />
          </Button>
          {!reminder.verified && (
            <Button size="sm" variant="outline" className="text-xs rounded-lg text-gw-green border-gw-green/30" onClick={onVerify}>
              <Check className="h-3 w-3 mr-1" /> Verify
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-xs h-7 text-muted-foreground" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const RemindersTab: React.FC = () => {
  const { reminders, addReminder, verifyReminder, removeReminder, updateReminder } = useGuardianStore();
  const [addOpen, setAddOpen] = useState(false);
  const [reminderType, setReminderType] = useState<string>('medication');
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<ReminderFormState>({ ...DEFAULT_FORM });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const imageUrl = typeof reader.result === 'string' ? reader.result : '';
        setPhotoPreview(imageUrl);
        setForm((currentForm) => ({ ...currentForm, photo: imageUrl }));
      };
      reader.readAsDataURL(file);
    }
  };

  const resetForm = () => {
    setForm({ ...DEFAULT_FORM });
    setPhotoPreview('');
    setReminderType('medication');
    setEditingReminderId(null);
  };

  const handleDialogChange = (open: boolean) => {
    setAddOpen(open);
    if (!open) {
      resetForm();
    }
  };

  const openEditDialog = (reminder: Reminder) => {
    setEditingReminderId(reminder.id);
    setReminderType(reminder.type);
    setForm(buildFormFromReminder(reminder));
    setPhotoPreview(reminder.photo || '');
    setAddOpen(true);
  };

  const handleSave = () => {
    const reminderPayload: Reminder = {
      id: editingReminderId || `rem-${Date.now()}`,
      type: reminderType as Reminder['type'],
      title: form.title || form.pillName || form.mealType || form.routineDescription || 'Reminder',
      time: form.time,
      repeat: form.repeat as Reminder['repeat'],
      verified: false,
      createdAt: new Date().toISOString(),
      ...(reminderType === 'medication' && { photo: form.photo, pillName: form.pillName, dosage: form.dosage }),
      ...(reminderType === 'food' && { mealType: form.mealType }),
      ...(reminderType === 'activity' && { videoUrl: form.videoUrl, routineDescription: form.routineDescription }),
      ...(reminderType === 'appointment' && { doctorName: form.doctorName, hospitalName: form.hospitalName, appointmentDate: form.appointmentDate }),
    };

    if (editingReminderId) {
      updateReminder(editingReminderId, reminderPayload);
      triggerAlert('notification');
    } else {
      addReminder(reminderPayload);
      triggerAlert('reminder');
    }

    setAddOpen(false);
    resetForm();
  };

  const handleVerify = (id: string) => {
    verifyReminder(id);
    triggerAlert('notification');
  };

  const filterReminders = (type: string) => reminders.filter(r => r.type === type);
  const updateFormTime = (updates: Partial<TimeParts12Hour>) => {
    setForm((currentForm) => ({
      ...currentForm,
      time: from12HourParts({ ...to12HourParts(currentForm.time), ...updates }),
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-foreground">Reminders</h3>
        <Dialog open={addOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button className="bg-teal hover:bg-teal/90 text-primary-foreground rounded-xl">
              <Plus className="h-4 w-4 mr-1" /> Add Reminder
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">{editingReminderId ? 'Edit Reminder' : 'New Reminder'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Type Selection */}
              <div className="space-y-2">
                <Label>Reminder Type</Label>
                <Select value={reminderType} onValueChange={setReminderType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="medication"><span className="flex items-center gap-2"><Pill className="h-4 w-4" /> Medication</span></SelectItem>
                    <SelectItem value="food"><span className="flex items-center gap-2"><UtensilsCrossed className="h-4 w-4" /> Food</span></SelectItem>
                    <SelectItem value="activity"><span className="flex items-center gap-2"><Dumbbell className="h-4 w-4" /> Activity</span></SelectItem>
                    <SelectItem value="appointment"><span className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Appointment</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Medication Fields */}
              {reminderType === 'medication' && (
                <>
                  <div className="space-y-2">
                    <Label>Pill Photo</Label>
                    <div className="border-2 border-dashed border-teal/30 rounded-xl p-4 text-center cursor-pointer hover:bg-secondary/50 transition-colors"
                      onClick={() => fileInputRef.current?.click()}>
                      {photoPreview ? (
                        <img src={photoPreview} alt="pill" className="w-24 h-24 mx-auto rounded-xl object-cover" />
                      ) : (
                        <div className="space-y-2">
                          <Camera className="h-8 w-8 mx-auto text-teal" />
                          <p className="text-sm text-muted-foreground">Click to upload pill photo</p>
                        </div>
                      )}
                      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pill-name">Medication Name</Label>
                    <Input id="pill-name" placeholder="e.g. Metformin" value={form.pillName}
                      onChange={e => setForm({ ...form, pillName: e.target.value, title: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dosage">Dosage</Label>
                    <Input id="dosage" placeholder="e.g. 500mg" value={form.dosage}
                      onChange={e => setForm({ ...form, dosage: e.target.value })} />
                  </div>
                </>
              )}

              {/* Food Fields */}
              {reminderType === 'food' && (
                <div className="space-y-2">
                  <Label>Meal Type</Label>
                  <Select value={form.mealType} onValueChange={v => setForm({ ...form, mealType: v, title: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Breakfast', 'Morning Snack', 'Lunch', 'Evening Snack', 'Dinner'].map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Timing verification sent to watch — elder confirms by tapping</p>
                </div>
              )}

              {/* Activity Fields */}
              {reminderType === 'activity' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="routine">Activity / Routine Description</Label>
                    <Textarea id="routine" placeholder="e.g. 30 min morning walk in park" value={form.routineDescription}
                      onChange={e => setForm({ ...form, routineDescription: e.target.value, title: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="video-url">Video URL (exercise guide, yoga tutorial, etc.)</Label>
                    <Input id="video-url" placeholder="https://youtube.com/watch?v=..." value={form.videoUrl}
                      onChange={e => setForm({ ...form, videoUrl: e.target.value })} />
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Video className="h-3 w-3" /> Attach an exercise video for the elder to follow on Smart TV
                    </p>
                  </div>
                </>
              )}

              {/* Appointment Fields */}
              {reminderType === 'appointment' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="doc-name">Doctor Name</Label>
                    <Input id="doc-name" placeholder="Dr. Ramesh Kumar" value={form.doctorName}
                      onChange={e => setForm({ ...form, doctorName: e.target.value, title: `Dr. ${e.target.value}` })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hospital">Hospital / Clinic</Label>
                    <Input id="hospital" placeholder="Apollo Hospitals" value={form.hospitalName}
                      onChange={e => setForm({ ...form, hospitalName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="apt-date">Appointment Date</Label>
                    <Input id="apt-date" type="date" value={form.appointmentDate}
                      onChange={e => setForm({ ...form, appointmentDate: e.target.value })} />
                  </div>
                </>
              )}

              {/* Common Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="rem-time">Time</Label>
                  <div id="rem-time" className="flex items-center gap-1">
                    <Select value={to12HourParts(form.time).hour} onValueChange={(value) => updateFormTime({ hour: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {HOUR_OPTIONS.map((hour) => <SelectItem key={hour} value={hour}>{hour}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">:</span>
                    <Select value={to12HourParts(form.time).minute} onValueChange={(value) => updateFormTime({ minute: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MINUTE_OPTIONS.map((minute) => <SelectItem key={minute} value={minute}>{minute}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={to12HourParts(form.time).period} onValueChange={(value) => updateFormTime({ period: value as TimeParts12Hour['period'] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AM">AM</SelectItem>
                        <SelectItem value="PM">PM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Repeat</Label>
                  <Select value={form.repeat} onValueChange={v => setForm({ ...form, repeat: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once">Once</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button className="w-full bg-teal hover:bg-teal/90 text-primary-foreground rounded-xl h-11" onClick={handleSave}>
                <Check className="h-4 w-4 mr-1" /> {editingReminderId ? 'Update Reminder' : 'Save Reminder'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Reminder Sections */}
      <Tabs defaultValue="medication">
        <TabsList className="bg-muted rounded-xl">
          <TabsTrigger value="medication" className="rounded-lg text-xs"><Pill className="h-3 w-3 mr-1" /> Medication</TabsTrigger>
          <TabsTrigger value="food" className="rounded-lg text-xs"><UtensilsCrossed className="h-3 w-3 mr-1" /> Food</TabsTrigger>
          <TabsTrigger value="activity" className="rounded-lg text-xs"><Dumbbell className="h-3 w-3 mr-1" /> Activity</TabsTrigger>
          <TabsTrigger value="appointment" className="rounded-lg text-xs"><Calendar className="h-3 w-3 mr-1" /> Appointment</TabsTrigger>
        </TabsList>

        {['medication', 'food', 'activity', 'appointment'].map(type => (
          <TabsContent key={type} value={type} className="space-y-2 mt-4">
            {filterReminders(type).length === 0 ? (
              <Card className="rounded-xl">
                <CardContent className="p-6 text-center text-muted-foreground text-sm">
                  No {type} reminders yet. Add one above.
                </CardContent>
              </Card>
            ) : (
              filterReminders(type).map(r => (
                <ReminderCard
                  key={r.id}
                  reminder={r}
                  onVerify={() => handleVerify(r.id)}
                  onDelete={() => removeReminder(r.id)}
                  onEdit={() => openEditDialog(r)}
                />
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default RemindersTab;
