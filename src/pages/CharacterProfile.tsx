import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Play, MessageCircle } from "lucide-react";
import { getCharacter, asmrtCategories, type ASMRType } from "@/data/characters";
import { Button } from "@/components/ui/button";

const CharacterProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const character = getCharacter(id || "");

  if (!character) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Character not found.</p>
      </div>
    );
  }

  const handleStartChat = (asmrType: ASMRType) => {
    navigate(`/chat/${character.id}/${asmrType}`);
  };

  return (
    <div className="min-h-screen pb-8 max-w-2xl mx-auto">
      {/* Header */}
            <div
        className="relative h-56 flex items-end p-4"
        style={{
          backgroundImage: `url(${character.headerImages?.stranger ?? ""})`,
          backgroundSize: "cover",
          backgroundPosition: "center top",
        }}
      >
        {/* Dark gradient overlay as a child div */}
        <div 
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, hsl(${character.accentColor} / 0.3) 0%, hsl(var(--background)) 100%)`,
          }}
        />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 h-9 w-9 rounded-full glass flex items-center justify-center z-10"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>

        <div className="flex items-end gap-4 relative z-10">
          <div className="h-20 w-20 rounded-2xl glass flex items-center justify-center text-4xl">
            {character.emoji}
          </div>
          <div className="pb-1">
            <h1 className="font-heading text-2xl font-bold text-foreground">{character.name}</h1>
            <p className="text-sm text-muted-foreground">{character.archetype} · {character.race}</p>
          </div>
        </div>
      </div>

      {/* Bio */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 mt-4"
      >
        <p className="text-sm text-foreground/80 leading-relaxed">{character.bio}</p>

        {/* Personality tags */}
        <div className="flex flex-wrap gap-2 mt-4">
          {character.personality.map(trait => (
            <span key={trait} className="px-2.5 py-1 rounded-full glass text-xs text-muted-foreground">
              {trait}
            </span>
          ))}
        </div>

        {/* Voice */}
        <div className="mt-5 glass rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Voice</p>
          <p className="text-sm text-foreground">{character.voiceDescription}</p>
        </div>

        {/* Greeting preview */}
        <div className="mt-4 glass rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Preview</p>
          <p className="text-sm text-foreground/80 italic leading-relaxed">{character.greeting}</p>
        </div>

        {/* Whisper Corner — pure character chat (no asmrType) */}
        <div className="mt-6">
          <h2 className="font-heading text-lg font-semibold text-foreground">Whisper Corner</h2>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">
            {character.name} is waiting for you
          </p>
          <button
            onClick={() => navigate(`/chat/${character.id}`)}
            className="w-full text-left rounded-2xl p-4 border border-border/40 bg-gradient-to-br from-secondary/10 via-background to-primary/10 hover:from-secondary/20 hover:to-primary/20 transition-colors flex items-center gap-3 backdrop-blur-sm"
            style={{
              boxShadow: `0 0 30px -12px hsl(${character.accentColor} / 0.35)`,
            }}
          >
            <div
              className="h-11 w-11 rounded-full flex items-center justify-center shrink-0"
              style={{ background: `hsl(${character.accentColor} / 0.18)` }}
            >
              <MessageCircle className="h-5 w-5 text-foreground/80" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Just talk</p>
              <p className="text-xs text-muted-foreground truncate">
                A quiet, one-on-one conversation
              </p>
            </div>
          </button>
        </div>

        {/* ASMR Channels */}
        <div className="mt-6">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3">ASMR Channels</h2>
          <div className="flex flex-col gap-2">
            {character.asmrtSpecialties.map(specId => {
              const cat = asmrtCategories.find(c => c.id === specId);
              if (!cat) return null;
              return (
                <Button
                  key={specId}
                  variant="ghost"
                  onClick={() => handleStartChat(specId)}
                  className="w-full justify-between glass h-auto py-3 px-4 hover:glow-purple"
                >
                  <div className="flex items-center gap-3 text-left">
                    <span className="text-lg">{cat.emoji}</span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{cat.label}</p>
                      <p className="text-xs text-muted-foreground">{cat.description}</p>
                    </div>
                  </div>
                  <Play className="h-4 w-4 text-primary shrink-0" />
                </Button>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default CharacterProfile;
