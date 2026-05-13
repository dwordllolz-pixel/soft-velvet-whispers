import { useNavigate } from "react-router-dom";
import { Heart } from "lucide-react";
import { type Character } from "@/data/characters";

interface CharacterCardProps {
  character: Character;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

const CharacterCard = ({ character, isFavorite, onToggleFavorite }: CharacterCardProps) => {
  const navigate = useNavigate();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/character/${character.id}`)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/character/${character.id}`);
        }
      }}
      className="w-full text-left glass rounded-xl overflow-hidden transition-all duration-300 hover:glow-purple active:scale-[0.98] group relative"
    >
      {/* Favorite button */}
      {onToggleFavorite && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="absolute top-2 right-2 z-10 h-7 w-7 rounded-full glass flex items-center justify-center transition-colors"
        >
          <Heart
            className={`h-3.5 w-3.5 transition-colors ${
              isFavorite ? "text-pink-400 fill-current" : "text-muted-foreground"
            }`}
          />
        </button>
      )}

      {/* Avatar area */}
      <div
        className="h-32 relative flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, hsl(${character.accentColor} / 0.3), hsl(var(--background)))`,
        }}
      >
        <span className="text-5xl">{character.emoji}</span>
        <div className="absolute bottom-2 right-2 flex gap-1">
          {character.asmrtSpecialties.slice(0, 2).map(s => {
            const cat = { boyfriend: "💜", "mouth-sounds": "👄", "ear-to-ear": "🎧", "personal-attention": "✨", medical: "🩺", tapping: "🔮", "sleep-aid": "🌙", confession: "💌" }[s];
            return <span key={s} className="text-xs">{cat}</span>;
          })}
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="font-heading font-semibold text-foreground text-sm">{character.name}</h3>
        <p className="text-muted-foreground text-xs mt-0.5 line-clamp-1">{character.archetype}</p>
      </div>
    </div>
  );
};

export default CharacterCard;
