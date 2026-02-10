import React, { useState } from 'react';
import { Character } from '../types';
import { Button } from './Button';
import { X, Upload, Trash2, UserPlus, Sparkles, Plus } from 'lucide-react';
import { createCharacter } from '../services/characterService';

interface CharacterLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  characters: Character[];
  setCharacters: React.Dispatch<React.SetStateAction<Character[]>>;
}

export const CharacterLibrary: React.FC<CharacterLibraryProps> = ({
  isOpen, onClose, characters, setCharacters
}) => {
  const [view, setView] = useState<'list' | 'create'>('list');
  const [newName, setNewName] = useState("");
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Store full Data URL
        setNewPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateCharacter = async () => {
    if (!newName || !newPhoto) return;
    setIsGenerating(true);
    try {
      const newChar = await createCharacter(newName, newPhoto);
      setCharacters(prev => [...prev, newChar]);
      setView('list');
      setNewName("");
      setNewPhoto(null);
    } catch (e) {
      console.error(e);
      alert("创建人物失败，请重试");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("确定删除这个人物吗？")) {
      setCharacters(prev => prev.filter(c => c.id !== id));
    }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity" 
          onClick={onClose}
        />
      )}
      
      {/* Slide Panel */}
      <div className={`fixed inset-y-0 left-0 w-[350px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} border-r border-gray-100`}>
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-white">
            <h2 className="text-xl font-bold text-gray-900">Characters</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-800 transition-colors p-1 rounded-full hover:bg-gray-100">
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
            {view === 'list' ? (
              <div className="space-y-4">
                 {characters.length === 0 && (
                   <div className="flex flex-col items-center justify-center py-12 text-center">
                     <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-300">
                       <UserPlus size={32} />
                     </div>
                     <p className="text-gray-500 font-medium">No characters yet</p>
                     <p className="text-xs text-gray-400 mt-1 max-w-[200px]">Add characters to maintain consistency in your stories.</p>
                   </div>
                 )}
                 {characters.map(char => (
                   <div key={char.id} className="group flex items-center gap-4 p-4 rounded-2xl bg-white border border-gray-100 shadow-sm hover:border-primary-200 hover:shadow-md transition-all">
                     <img src={char.avatarUrl} alt={char.name} className="w-14 h-14 rounded-full object-cover bg-gray-100 border-2 border-white shadow-sm" />
                     <div className="flex-1 min-w-0">
                       <h3 className="font-bold text-gray-900 truncate">{char.name}</h3>
                       <p className="text-xs text-gray-400 truncate">Added {new Date(char.createdAt).toLocaleDateString()}</p>
                     </div>
                     <button 
                       onClick={() => handleDelete(char.id)} 
                       className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                       title="Delete"
                     >
                       <Trash2 size={16} />
                     </button>
                   </div>
                 ))}
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Name</label>
                  <input 
                    type="text" 
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full p-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all outline-none"
                    placeholder="e.g. Niannian"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Reference Photo</label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full aspect-square border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/10 transition-all overflow-hidden bg-white"
                  >
                    {newPhoto ? (
                      <img src={newPhoto} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center text-gray-400">
                        <Upload size={32} className="mx-auto mb-2 text-gray-300" />
                        <span className="text-sm font-medium">Click to upload</span>
                      </div>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-100 bg-white">
            {view === 'list' ? (
              <Button onClick={() => setView('create')} className="w-full h-12 text-base shadow-lg shadow-primary-100">
                <Plus className="mr-2" size={20} /> New Character
              </Button>
            ) : (
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setView('list')} className="flex-1">Cancel</Button>
                <Button onClick={handleCreateCharacter} isLoading={isGenerating} disabled={!newName || !newPhoto} className="flex-[2]">
                  {!isGenerating && <Sparkles className="mr-2" size={18} />}
                  Generate
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};