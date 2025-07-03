'use client';

import { useState, useEffect, useRef } from 'react';
import {
  BrainCircuit,
  FileText,
  KeyRound,
  Loader,
  Save,
  Download,
  Play,
  StopCircle,
  RefreshCw,
  Edit,
} from 'lucide-react';
import { generateSyntheticEntry } from '@/ai/flows/generate-synthetic-data';
import { modifyDatasetEntry } from '@/ai/flows/data-quality-assurance';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Slider } from '@/components/ui/slider';

const MAX_ENTRIES = 10000;

type DataEntry = {
  id: number;
  context: string;
  input: string;
  output: string;
};

export default function DataGeniusPage() {
  const [apiKey, setApiKey] = useState('');
  const [tempApiKey, setTempApiKey] = useState('');
  const [isApiKeySaved, setIsApiKeySaved] = useState(false);
  const [prd, setPrd] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [dataPreview, setDataPreview] = useState<DataEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  
  const [modificationInstruction, setModificationInstruction] = useState('');
  const [modificationEntryId, setModificationEntryId] = useState('');
  const [isModifying, setIsModifying] = useState(false);


  const isGeneratingRef = useRef(false);
  const isPausedByUserRef = useRef(false);
  const fullDataRef = useRef<DataEntry[]>([]);
  const isMounted = useRef(true);

  const { toast } = useToast();

  useEffect(() => {
    isMounted.current = true;
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      setApiKey(savedKey);
      setIsApiKeySaved(true);
    }
    return () => {
      isMounted.current = false;
      isGeneratingRef.current = false; // Stop generation on unmount
    };
  }, []);
  
  useEffect(() => {
      let timer: NodeJS.Timeout;
      if (countdown !== null && countdown > 0) {
        setError(`An error occurred. Resuming in ${countdown} seconds...`);
        timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      } else if (countdown === 0) {
        setCountdown(null);
        setError(null);
        handleGenerate();
      }
      return () => clearTimeout(timer);
  }, [countdown]);

  const handleSaveKey = (key: string) => {
    if (key) {
      setApiKey(key);
      localStorage.setItem('gemini_api_key', key);
      setIsApiKeySaved(true);
      toast({
        title: 'Success',
        description: 'API Key saved successfully.',
      });
      return true;
    }
    toast({
      variant: 'destructive',
      title: 'Error',
      description: 'API Key cannot be empty.',
    });
    return false;
  };

  const handleStop = () => {
    isGeneratingRef.current = false;
    isPausedByUserRef.current = true;
    setIsGenerating(false);
    setCountdown(null);
    setError('Data generation stopped by user.');
  };

  const isApiKeyError = (e: any): boolean => {
    const msg = e.message?.toLowerCase() || '';
    return msg.includes('api key') || msg.includes('429') || msg.includes('rate limit');
  };
  
  const downloadFile = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    const header = 'id,context,input,output\n';
    const csvContent = fullDataRef.current
        .map(e => {
            const context = `"${e.context.replace(/"/g, '""')}"`;
            const input = `"${e.input.replace(/"/g, '""')}"`;
            const output = `"${e.output.replace(/"/g, '""')}"`;
            return `${e.id},${context},${input},${output}`;
        })
        .join('\n');
    downloadFile('datagenius_dataset.csv', header + csvContent, 'text/csv;charset=utf-8;');
  };
  
  const handleDownloadJson = () => {
      const jsonContent = JSON.stringify(fullDataRef.current, null, 2);
      downloadFile('datagenius_dataset.json', jsonContent, 'application/json;charset=utf-8;');
  };

  const handleGenerate = async () => {
    if (!prd.trim()) {
        toast({ variant: 'destructive', title: 'Error', description: 'Product Requirements Document (PRD) cannot be empty.' });
        return;
    }

    if (isGeneratingRef.current) return;

    setError(null);
    isPausedByUserRef.current = false;
    isGeneratingRef.current = true;
    setIsGenerating(true);
    
    try {
        while (fullDataRef.current.length < MAX_ENTRIES && isGeneratingRef.current) {
            let successfulEntry = false;
            let retries = 0;
            
            while(!successfulEntry && retries < 3 && isGeneratingRef.current) {
                try {
                    const result = await generateSyntheticEntry({ prd, temperature });
                    
                    if (isGeneratingRef.current) {
                        const newId = fullDataRef.current.length + 1;
                        const newEntry = { id: newId, ...result };

                        fullDataRef.current.push(newEntry);
                        
                        if (isMounted.current) {
                            setDataPreview(prev => [newEntry, ...prev].slice(0, 100));
                            const newProgress = (fullDataRef.current.length / MAX_ENTRIES) * 100;
                            setProgress(newProgress);
                        }
                    }
                    successfulEntry = true;
                    setError(null);

                } catch (e: any) {
                    console.error(e);
                    if (isApiKeyError(e)) {
                        setError('API key limit reached or invalid. Please provide a new key to resume.');
                        setShowKeyDialog(true);
                        isGeneratingRef.current = false;
                        if(isMounted.current) setIsGenerating(false);
                        return; // Stop and wait for user
                    }
                    retries++;
                    setError(`An error occurred. Retrying... (Attempt ${retries})`);
                    await new Promise(res => setTimeout(res, 5000));
                }
            }
            if (!successfulEntry) {
                 throw new Error("Failed to generate data after multiple retries. Pausing.");
            }
        }
    } catch (e: any) {
        console.error(e);
        setError(e.message || 'An unexpected error occurred. Pausing generation.');
    } finally {
        if (!isMounted.current) return;
        
        const stoppedForError = !isPausedByUserRef.current && fullDataRef.current.length < MAX_ENTRIES;

        isGeneratingRef.current = false;
        setIsGenerating(false);
        
        if (stoppedForError) {
             setCountdown(10);
        } else if (fullDataRef.current.length >= MAX_ENTRIES) {
             toast({ title: "Success!", description: "Dataset generation complete." });
             setProgress(100);
        }
    }
};

 const handleModifyEntry = async () => {
    if (!modificationInstruction.trim() || !modificationEntryId.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please provide an Entry ID and a modification instruction.' });
      return;
    }

    const entryIdNum = parseInt(modificationEntryId, 10);
    const entryToModify = fullDataRef.current.find(e => e.id === entryIdNum);

    if (!entryToModify) {
      toast({ variant: 'destructive', title: 'Error', description: `Entry with ID ${entryIdNum} not found.` });
      return;
    }

    setIsModifying(true);
    setError(null);

    try {
      const modifiedEntry = await modifyDatasetEntry({
        instruction: modificationInstruction,
        entry: entryToModify,
      });
      
      const updateIndex = fullDataRef.current.findIndex(e => e.id === modifiedEntry.id);
      if (updateIndex !== -1) {
        fullDataRef.current[updateIndex] = modifiedEntry;
        // Also update preview if it's there
        const previewIndex = dataPreview.findIndex(e => e.id === modifiedEntry.id);
        if (previewIndex !== -1) {
            const newPreview = [...dataPreview];
            newPreview[previewIndex] = modifiedEntry;
            setDataPreview(newPreview);
        }
        toast({ title: 'Success', description: `Entry ${modifiedEntry.id} has been modified.` });
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Failed to modify entry.');
      toast({ variant: 'destructive', title: 'Modification Failed', description: e.message });
    } finally {
      setIsModifying(false);
      setModificationEntryId('');
      setModificationInstruction('');
    }
  };


  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      <main className="container mx-auto p-4 md:p-8">
        <header className="text-center mb-10">
          <h1 className="text-5xl font-bold text-primary font-headline">
            DataGenius
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Generate vast, high-quality datasets with the power of AI.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-1 flex flex-col gap-8">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="text-primary" />
                  <span>API Key Management</span>
                </CardTitle>
                <CardDescription>
                  Enter your Gemini API key. It will be saved in your browser.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="api-key">Gemini API Key</Label>
                  <div className="flex gap-2">
                    <Input
                      id="api-key"
                      type="password"
                      placeholder="Enter your API key"
                      defaultValue={apiKey}
                      onChange={e => setTempApiKey(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleSaveKey(tempApiKey || apiKey)}
                      aria-label="Save API Key"
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                  </div>
                   {isApiKeySaved && (
                    <p className="text-sm text-green-600">
                      API Key is configured.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="text-primary" />
                  <span>Product Requirements</span>
                </CardTitle>
                <CardDescription>
                  Describe the dataset you want to generate.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="e.g., 'A dataset of customer support chat logs for an e-commerce fashion store...'"
                  className="min-h-[200px]"
                  value={prd}
                  onChange={e => setPrd(e.target.value)}
                  disabled={isGenerating}
                />
                 <div className="space-y-3 mt-4">
                    <div className="flex justify-between">
                        <Label htmlFor="temperature">Creativity (Temperature)</Label>
                        <span className="text-sm font-medium text-primary">{temperature.toFixed(2)}</span>
                    </div>
                    <Slider
                        id="temperature"
                        min={0}
                        max={1}
                        step={0.05}
                        value={[temperature]}
                        onValueChange={(vals) => setTemperature(vals[0])}
                        disabled={isGenerating}
                    />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 flex flex-col gap-8">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BrainCircuit className="text-primary" />
                  <span>AI Data Generation</span>
                </CardTitle>
                <CardDescription>
                  Start the generation process. You can stop anytime.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  {!isGenerating && countdown === null ? (
                    <Button className="w-full sm:w-auto flex-grow bg-primary hover:bg-primary/90" onClick={handleGenerate} disabled={!isApiKeySaved || !prd}>
                      <Play className="mr-2" />
                      Generate Dataset
                    </Button>
                  ) : (
                    <Button className="w-full sm:w-auto flex-grow" variant="destructive" onClick={handleStop}>
                      <StopCircle className="mr-2" />
                      Stop Generation
                    </Button>
                  )}

                  <Button className="w-full sm:w-auto" variant="secondary" onClick={handleDownloadCsv} disabled={fullDataRef.current.length === 0}>
                    <Download className="mr-2" />
                    Download CSV
                  </Button>
                  <Button className="w-full sm:w-auto" variant="secondary" onClick={handleDownloadJson} disabled={fullDataRef.current.length === 0}>
                    <Download className="mr-2" />
                    Download JSON
                  </Button>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label>Progress</Label>
                            <span className="text-sm font-medium text-primary">
                                {fullDataRef.current.length.toLocaleString()} / {MAX_ENTRIES.toLocaleString()}
                            </span>
                        </div>
                        <Progress value={progress} className="w-full" />
                    </div>

                    {error && <p className="text-sm text-destructive flex items-center gap-2">
                        {countdown !== null && <RefreshCw className="h-4 w-4 animate-spin"/>}
                        {error}
                    </p>}
                </div>

                <div className="mt-6 relative">
                    <div className="overflow-auto max-h-[500px] border rounded-lg">
                      <Table>
                          <TableHeader className="sticky top-0 bg-card">
                              <TableRow>
                                  <TableHead className="w-[100px]">ID</TableHead>
                                  <TableHead>Context</TableHead>
                                  <TableHead>Input</TableHead>
                                  <TableHead>Output</TableHead>
                              </TableRow>
                          </TableHeader>
                          <TableBody>
                              {dataPreview.length > 0 ? (
                                  dataPreview.map(entry => (
                                      <TableRow key={entry.id}>
                                          <TableCell className="font-medium">{entry.id}</TableCell>
                                          <TableCell>{entry.context}</TableCell>
                                          <TableCell>{entry.input}</TableCell>
                                          <TableCell>{entry.output}</TableCell>
                                      </TableRow>
                                  ))
                              ) : (
                                  <TableRow>
                                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                          {isGenerating ? 'Generating data...' : 'Generated data will appear here.'}
                                      </TableCell>
                                  </TableRow>
                              )}
                          </TableBody>
                      </Table>
                    </div>
                    {isGenerating && (
                        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
                            <Loader className="animate-spin text-primary h-10 w-10" />
                        </div>
                    )}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Edit className="text-primary" />
                        <span>Modify Dataset Entry</span>
                    </CardTitle>
                    <CardDescription>
                        Enter the ID of an entry and an instruction to modify it with AI.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div className="sm:col-span-1 space-y-2">
                            <Label htmlFor="modify-id">Entry ID</Label>
                            <Input 
                                id="modify-id" 
                                placeholder="e.g., 42"
                                value={modificationEntryId}
                                onChange={(e) => setModificationEntryId(e.target.value)}
                                disabled={isModifying}
                            />
                        </div>
                        <div className="sm:col-span-3 space-y-2">
                            <Label htmlFor="modify-instruction">Instruction</Label>
                            <Textarea
                                id="modify-instruction"
                                placeholder="e.g., 'Make the output more enthusiastic.'"
                                className="min-h-[40px]"
                                value={modificationInstruction}
                                onChange={(e) => setModificationInstruction(e.target.value)}
                                disabled={isModifying}
                            />
                        </div>
                    </div>
                    <Button onClick={handleModifyEntry} disabled={isModifying} className="mt-4 w-full sm:w-auto">
                        {isModifying ? <Loader className="animate-spin mr-2" /> : <RefreshCw className="mr-2" />}
                        Modify Entry
                    </Button>
                </CardContent>
            </Card>

          </div>
        </div>
      </main>

      <AlertDialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>New API Key Required</AlertDialogTitle>
            <AlertDialogDescription>
              {error || 'The previous API key failed. Please enter a new Gemini API key to resume data generation.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="new-api-key" className="sr-only">New API Key</Label>
            <Input
              id="new-api-key"
              type="password"
              placeholder="Enter new Gemini API key"
              onChange={(e) => setTempApiKey(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => isPausedByUserRef.current = true }>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (handleSaveKey(tempApiKey)) {
                setShowKeyDialog(false);
                setError(null);
                handleGenerate();
              }
            }}>
              Save and Resume
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
