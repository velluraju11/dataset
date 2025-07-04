
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
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';

const NUM_API_KEYS = 5;

type DataEntry = {
  id: number;
  context: string;
  input: string;
  output: string;
};

export default function DataGeniusPage() {
  const [apiKeys, setApiKeys] = useState<string[]>(Array(NUM_API_KEYS).fill(''));
  const [areApiKeysSaved, setAreApiKeysSaved] = useState(false);
  const [currentApiKeyIndex, setCurrentApiKeyIndex] = useState(0);

  const [prd, setPrd] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [dataPreview, setDataPreview] = useState<DataEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  
  const [modificationInstruction, setModificationInstruction] = useState('');
  const [modificationEntryIds, setModificationEntryIds] = useState('');
  const [isModifying, setIsModifying] = useState(false);
  const [modificationPreview, setModificationPreview] = useState<{
    original: DataEntry;
    modified: DataEntry;
  } | null>(null);


  const isGeneratingRef = useRef(false);
  const isPausedByUserRef = useRef(false);
  const fullDataRef = useRef<DataEntry[]>([]);
  const isMounted = useRef(true);

  const { toast } = useToast();

  useEffect(() => {
    isMounted.current = true;
    try {
        const savedKeysRaw = localStorage.getItem('datagenius_api_keys');
        if (savedKeysRaw) {
            const savedKeys = JSON.parse(savedKeysRaw);
            if (Array.isArray(savedKeys) && savedKeys.length === NUM_API_KEYS) {
                setApiKeys(savedKeys);
                if (savedKeys.some(key => key.trim())) {
                    setAreApiKeysSaved(true);
                }
            }
        }
    } catch (e) {
        console.error("Failed to load API keys from localStorage", e);
    }
    return () => {
      isMounted.current = false;
      isGeneratingRef.current = false;
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

  const handleApiKeyChange = (index: number, value: string) => {
    const newKeys = [...apiKeys];
    newKeys[index] = value;
    setApiKeys(newKeys);
    if(areApiKeysSaved && !newKeys.some(k => k.trim())) {
        setAreApiKeysSaved(false);
    }
  };

  const handleSaveKeys = () => {
    if (apiKeys.some(key => key.trim())) {
      localStorage.setItem('datagenius_api_keys', JSON.stringify(apiKeys));
      setAreApiKeysSaved(true);
      toast({
        title: 'Success',
        description: 'API Keys saved successfully.',
      });
      return true;
    }
    toast({
      variant: 'destructive',
      title: 'Error',
      description: 'At least one API Key is required.',
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
    return msg.includes('api key') || msg.includes('429') || msg.includes('rate limit') || msg.includes('permission denied');
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

    if (!areApiKeysSaved || !apiKeys.some(k => k.trim())) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please save at least one valid API key.' });
        return;
    }
    
    if (isGeneratingRef.current) return;

    setError(null);
    isPausedByUserRef.current = false;
    isGeneratingRef.current = true;
    setIsGenerating(true);
    
    let localCurrentApiKeyIndex = currentApiKeyIndex;
    const validKeyIndexes = apiKeys.map((key, i) => key.trim() ? i : -1).filter(i => i !== -1);

    if (validKeyIndexes.length === 0) {
      setError('No valid API keys available to start generation.');
      setIsGenerating(false);
      isGeneratingRef.current = false;
      return;
    }

    if (!validKeyIndexes.includes(localCurrentApiKeyIndex)) {
        localCurrentApiKeyIndex = validKeyIndexes[0];
        if (isMounted.current) setCurrentApiKeyIndex(localCurrentApiKeyIndex);
    }

    const failingKeyCycleDetector = new Set<number>();
    
    while (isGeneratingRef.current) {
        try {
            const activeApiKey = apiKeys[localCurrentApiKeyIndex];
            if (!activeApiKey || !activeApiKey.trim()) {
                throw new Error("Skipping empty key.");
            }

            const result = await generateSyntheticEntry({ 
              prd, 
              temperature, 
              apiKey: activeApiKey,
              apiKeyIndex: localCurrentApiKeyIndex
            });
            
            if (isGeneratingRef.current) {
                const newId = fullDataRef.current.length + 1;
                const newEntry = { id: newId, ...result };

                fullDataRef.current.push(newEntry);
                
                if (isMounted.current) {
                    setDataPreview(prev => [newEntry, ...prev].slice(0, 100));
                }
            }
            setError(null); 
            failingKeyCycleDetector.clear();

        } catch (e: any) {
            console.error(`Error with API Key Index #${localCurrentApiKeyIndex}:`, e);

            if (isApiKeyError(e) || e.message === "Skipping empty key.") {
                setError(`API Key ${localCurrentApiKeyIndex + 1} failed. Rotating to next key...`);
                failingKeyCycleDetector.add(localCurrentApiKeyIndex);

                if (failingKeyCycleDetector.size >= validKeyIndexes.length) {
                    setError('All provided API keys seem to be failing. Stopping generation.');
                    isGeneratingRef.current = false;
                    break;
                }

                const currentPositionInValid = validKeyIndexes.indexOf(localCurrentApiKeyIndex);
                const nextPositionInValid = (currentPositionInValid + 1) % validKeyIndexes.length;
                localCurrentApiKeyIndex = validKeyIndexes[nextPositionInValid];
                
                if (isMounted.current) {
                    setCurrentApiKeyIndex(localCurrentApiKeyIndex);
                }
                
                await new Promise(res => setTimeout(res, 1000));

            } else {
                 setError(e.message || 'An unexpected error occurred. Pausing generation.');
                 if (isGeneratingRef.current && !isPausedByUserRef.current) {
                    setCountdown(10);
                 }
                 isGeneratingRef.current = false;
                 break; 
            }
        }
    }
    
    if (isMounted.current) {
        setIsGenerating(false);
        if (!isGeneratingRef.current && !isPausedByUserRef.current && !countdown) {
            if(error) {
                toast({ variant: 'destructive', title: 'Stopped', description: error });
            }
        }
    }
};

 const handleModifyEntry = async () => {
    if (!modificationInstruction.trim() || !modificationEntryIds.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please provide Entry IDs and a modification instruction.' });
      return;
    }

    const idsToModify = modificationEntryIds
      .split(',')
      .map(id => parseInt(id.trim(), 10))
      .filter(id => !isNaN(id));

    if (idsToModify.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please enter valid, comma-separated Entry IDs.' });
      return;
    }
    
    const activeKeyIndex = apiKeys.findIndex(key => key.trim());
    if (activeKeyIndex === -1) {
        toast({ variant: 'destructive', title: 'Error', description: 'A valid API key is required to modify entries.' });
        return;
    }
    const activeApiKey = apiKeys[activeKeyIndex];

    const entriesToModify = idsToModify
      .map(id => fullDataRef.current.find(e => e.id === id))
      .filter((e): e is DataEntry => !!e);

    const foundIds = new Set(entriesToModify.map(e => e.id));
    const notFoundIds = idsToModify.filter(id => !foundIds.has(id));

    if (notFoundIds.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Some entries not found',
        description: `Could not find entries with IDs: ${notFoundIds.join(', ')}.`,
      });
    }

    if (entriesToModify.length === 0) {
      return;
    }

    setIsModifying(true);
    setError(null);
    setModificationPreview(null);

    const successfulResults: { original: DataEntry; modified: DataEntry }[] = [];
    const failedIds: number[] = [];

    for (const entryToModify of entriesToModify) {
        try {
            const modifiedEntry = await modifyDatasetEntry({
                instruction: modificationInstruction,
                entry: entryToModify,
                apiKey: activeApiKey,
                apiKeyIndex: activeKeyIndex
            });
            successfulResults.push({ original: entryToModify, modified: modifiedEntry });
        } catch (e) {
            console.error(`Failed to modify entry ${entryToModify.id}:`, e);
            failedIds.push(entryToModify.id);
        }
    }

    if (successfulResults.length > 0) {
        const modifiedEntryMap = new Map(successfulResults.map(r => [r.modified.id, r.modified]));
        
        fullDataRef.current = fullDataRef.current.map(entry =>
          modifiedEntryMap.get(entry.id) || entry
        );

        setDataPreview(prev => prev.map(entry =>
          modifiedEntryMap.get(entry.id) || entry
        ));
        
        setModificationPreview(successfulResults[successfulResults.length - 1]);
        toast({ title: 'Success', description: `Modified ${successfulResults.length} entries.` });
    }

    if (failedIds.length > 0) {
        toast({ variant: 'destructive', title: 'Modification Incomplete', description: `Failed to modify entries: ${failedIds.join(', ')}` });
    }

    setIsModifying(false);
    setModificationEntryIds('');
    setModificationInstruction('');
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
                  Provide up to {NUM_API_KEYS} API keys. The generator will cycle through them.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {apiKeys.map((key, index) => (
                    <div key={index} className="space-y-2">
                      <Label htmlFor={`api-key-${index}`}>
                        {index <= 2 ? (
                          <>
                            API Key {index + 1} (Google AI)
                            {index === 0 && <span className="text-destructive">*</span>}
                          </>
                        ) : index === 3 ? (
                          'API Key 4 (OpenRouter - DeepSeek R1)'
                        ) : (
                          'API Key 5 (OpenRouter - Gemini Flash Exp)'
                        )}
                      </Label>
                      <Input
                        id={`api-key-${index}`}
                        type="password"
                        placeholder={
                          index <= 2
                            ? `Enter Google AI Key ${index + 1}`
                            : 'Enter OpenRouter API Key'
                        }
                        value={key}
                        onChange={e => handleApiKeyChange(index, e.target.value)}
                      />
                    </div>
                  ))}
                  <div className="flex items-center gap-4">
                    <Button onClick={handleSaveKeys}>
                      <Save className="mr-2" />
                      Save Keys
                    </Button>
                    {areApiKeysSaved && (
                        <p className="text-sm text-green-600">
                          API Keys are configured.
                        </p>
                      )}
                  </div>
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
                  Start the generation process. It will run until stopped.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  {!isGenerating && countdown === null ? (
                    <Button className="w-full sm:w-auto flex-grow bg-primary hover:bg-primary/90" onClick={handleGenerate} disabled={!areApiKeysSaved || !prd}>
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
                                {fullDataRef.current.length.toLocaleString()} entries generated
                            </span>
                        </div>
                    </div>

                    {error && <p className="text-sm text-destructive flex items-center gap-2">
                        {(isGenerating || countdown !== null) && <Loader className="h-4 w-4 animate-spin"/>}
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
                    {isGenerating && dataPreview.length === 0 && (
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
                  <span>Modify Dataset Entries</span>
                </CardTitle>
                <CardDescription>
                  Enter comma-separated IDs and an instruction to modify them with AI.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="sm:col-span-1 space-y-2">
                      <Label htmlFor="modify-ids">Entry IDs</Label>
                      <Input
                        id="modify-ids"
                        placeholder="e.g., 42, 101, 5"
                        value={modificationEntryIds}
                        onChange={(e) => setModificationEntryIds(e.target.value)}
                        disabled={isModifying}
                      />
                    </div>
                    <div className="sm:col-span-3 space-y-2">
                      <Label htmlFor="modify-instruction">Instruction</Label>
                      <Textarea
                        id="modify-instruction"
                        className="min-h-[40px]"
                        placeholder="e.g., 'Make the output more enthusiastic.'"
                        value={modificationInstruction}
                        onChange={(e) => setModificationInstruction(e.target.value)}
                        disabled={isModifying}
                      />
                    </div>
                  </div>
                  <Button onClick={handleModifyEntry} disabled={isModifying || !areApiKeysSaved} className="w-full sm:w-auto">
                    {isModifying ? <Loader className="animate-spin mr-2" /> : <RefreshCw className="mr-2" />}
                    Modify Entries
                  </Button>
                </div>
              </CardContent>

              {modificationPreview && (
                <>
                  <Separator className="my-4" />
                  <CardHeader className="pt-0">
                    <CardTitle>Modification Preview (ID: {modificationPreview.original.id})</CardTitle>
                    <CardDescription>Showing the last successfully modified entry.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-semibold mb-2 text-muted-foreground">Before</h4>
                        <div className="p-4 border rounded-lg space-y-3 text-sm bg-muted/20">
                          <p><strong className="font-medium text-foreground">Context:</strong> {modificationPreview.original.context}</p>
                          <p><strong className="font-medium text-foreground">Input:</strong> {modificationPreview.original.input}</p>
                          <p><strong className="font-medium text-foreground">Output:</strong> {modificationPreview.original.output}</p>
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2 text-foreground">After</h4>
                        <div className="p-4 border rounded-lg space-y-3 text-sm bg-primary/10 border-primary/50">
                          <p><strong className="font-medium text-foreground">Context:</strong> {modificationPreview.modified.context}</p>
                          <p><strong className="font-medium text-foreground">Input:</strong> {modificationPreview.modified.input}</p>
                          <p><strong className="font-medium text-foreground">Output:</strong> {modificationPreview.modified.output}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </>
              )}
            </Card>

          </div>
        </div>
      </main>
    </div>
  );
}
