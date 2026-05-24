-- ============================================================
-- ForexIQ — Supabase Database Schema
-- Ejecuta este SQL en: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  country TEXT,
  role TEXT DEFAULT 'standard' CHECK (role IN ('standard','verified','bronze','silver','gold','diamond','elite')),
  is_admin BOOLEAN DEFAULT FALSE,
  avatar_color TEXT DEFAULT '#1e293b',
  avatar_text_color TEXT DEFAULT '#64748b',
  total_payout NUMERIC DEFAULT 0,
  payout_verified BOOLEAN DEFAULT FALSE,
  forum_posts INTEGER DEFAULT 0,
  likes_received INTEGER DEFAULT 0,
  is_banned BOOLEAN DEFAULT FALSE,
  ban_reason TEXT,
  ban_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

-- 2. PAYOUT VERIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.payout_verifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  prop_firm TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  payout_date DATE NOT NULL,
  payment_method TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','reviewing','approved','rejected')),
  rejection_reason TEXT,
  document_urls TEXT[],
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. FORUM POSTS TABLE
CREATE TABLE IF NOT EXISTS public.forum_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tag TEXT CHECK (tag IN ('analysis','signal','debate','news','ask')),
  likes INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. FORUM REPLIES TABLE
CREATE TABLE IF NOT EXISTS public.forum_replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. POST LIKES TABLE (prevent double-liking)
CREATE TABLE IF NOT EXISTS public.post_likes (
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, post_id)
);

-- 6. BANS LOG TABLE
CREATE TABLE IF NOT EXISTS public.bans_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  banned_by UUID REFERENCES public.users(id),
  reason TEXT NOT NULL,
  duration TEXT NOT NULL,
  ban_until TIMESTAMPTZ,
  is_permanent BOOLEAN DEFAULT FALSE,
  lifted_at TIMESTAMPTZ,
  lifted_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. AI CHAT HISTORY TABLE (optional — stores conversations)
CREATE TABLE IF NOT EXISTS public.ai_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  messages JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES public.users(id),
  target_user UUID REFERENCES public.users(id),
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_verifications ENABLE ROW LEVEL SECURITY;

-- Users can read all users (for leaderboard/forum), edit only themselves
CREATE POLICY "Users are viewable by everyone" ON public.users FOR SELECT USING (TRUE);
CREATE POLICY "Users can update own record" ON public.users FOR UPDATE USING (auth.uid() = id);

-- Forum posts are public, but only author or admin can delete
CREATE POLICY "Posts are viewable by everyone" ON public.forum_posts FOR SELECT USING (is_deleted = FALSE);
CREATE POLICY "Authenticated users can create posts" ON public.forum_posts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authors can update their posts" ON public.forum_posts FOR UPDATE USING (auth.uid() = user_id);

-- Payout verifications: user sees only their own, admins see all
CREATE POLICY "Users see own verifications" ON public.payout_verifications FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- INDEXES for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_total_payout ON public.users(total_payout DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_created ON public.forum_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_tag ON public.forum_posts(tag);
CREATE INDEX IF NOT EXISTS idx_forum_replies_post ON public.forum_replies(post_id);
CREATE INDEX IF NOT EXISTS idx_payout_status ON public.payout_verifications(status);

-- ============================================================
-- HELPER FUNCTION: assign role based on total payout
-- ============================================================

CREATE OR REPLACE FUNCTION public.assign_role_by_payout(payout NUMERIC)
RETURNS TEXT AS $$
BEGIN
  IF payout >= 500000 THEN RETURN 'elite';
  ELSIF payout >= 200000 THEN RETURN 'diamond';
  ELSIF payout >= 100000 THEN RETURN 'gold';
  ELSIF payout >= 50000 THEN RETURN 'silver';
  ELSIF payout >= 25000 THEN RETURN 'bronze';
  ELSIF payout > 0 THEN RETURN 'verified';
  ELSE RETURN 'standard';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGER: auto-update role when payout changes
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_user_role()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.total_payout != OLD.total_payout AND NEW.payout_verified = TRUE THEN
    NEW.role := public.assign_role_by_payout(NEW.total_payout);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_role
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_user_role();
