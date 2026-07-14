import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { characters, asmrtCategories, type ASMRType } from "@/data/characters";
import CharacterCard from "@/components/CharacterCard";
import CategoryFilter from "@/components/CategoryFilter";
import { Bug, Headphones, User, LogOut, Heart, Clock, Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useFavorites } from "@/hooks/useFavorites";
import { useAdminDebug } from "@/hooks/useAdminDebug";

const Index = () => {
  const [selectedCategory, setSelectedCategory] = useState<ASMRType | null>(null);
  const [showFavOnly, setShowFavOnly] = useState(false);
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [user, loading, navigate]);
  const { favoriteIds, toggleFavorite } = useFavorites();
  const { canDebug } = useAdminDebug();

  const filteredCharacters = characters.filter((c) => {
    if (selectedCategory && !c.asmrtSpecialties.includes(selectedCategory)) return false;
    if (showFavOnly && !favoriteIds.has(c.id)) return false;
    return true;
  });

  return (
    <div className="min-h-screen pb-8 w-full max-w-full overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/30 px-4 py-3 safe-top">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <Headphones className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="font-heading text-lg font-bold text-gradient flex-1">Whisper</h1>

          {user ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate("/history")}
                className="h-8 w-8 rounded-full glass flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <Clock className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowFavOnly(!showFavOnly)}
                className={`h-8 w-8 rounded-full glass flex items-center justify-center transition-colors ${
                  showFavOnly ? "text-pink-400" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Heart className={`h-4 w-4 ${showFavOnly ? "fill-current" : ""}`} />
              </button>
              <button
                onClick={() => navigate("/settings")}
                className="h-8 w-8 rounded-full glass flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Settings"
              >
                <SettingsIcon className="h-4 w-4" />
              </button>
              {canDebug && (
                <button
                  onClick={() => navigate("/admin-debug")}
                  className="h-8 w-8 rounded-full glass flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Admin debug console"
                >
                  <Bug className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={signOut}
                className="h-8 w-8 rounded-full glass flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate("/auth")}
              className="h-8 rounded-full glass px-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <User className="h-3.5 w-3.5" />
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="px-4 pt-6 pb-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="font-heading text-2xl font-bold text-foreground leading-tight">
            Your late night<br />
            <span className="text-gradient">escape</span> starts here
          </h2>
          <p className="text-muted-foreground text-sm mt-2">
            AI-powered M4M ASMR roleplay. Pick a voice. Choose a vibe. Close your eyes.
          </p>
        </motion.div>
      </section>

      {/* Category Filter */}
      <CategoryFilter
        categories={asmrtCategories}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
      />

      {/* Character Grid */}
      <section className="px-4 mt-4">
        {showFavOnly && filteredCharacters.length === 0 ? (
          <div className="text-center py-12">
            <Heart className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No favorites yet</p>
            <p className="text-xs text-muted-foreground mt-1">Tap the heart on a character to save them</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredCharacters.map((character, i) => (
              <motion.div
                key={character.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <CharacterCard
                  character={character}
                  isFavorite={favoriteIds.has(character.id)}
                  onToggleFavorite={user ? () => toggleFavorite(character.id) : undefined}
                />
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Index;