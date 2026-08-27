//! Costanti, snippet e utility

use clap::ValueEnum;
use serde::Deserialize;
use std::path::PathBuf;

pub const PROGRAM_NAME: &str = env!("CARGO_PKG_NAME");
pub const PROGRAM_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const DEFAULT_LISTEN_ADDRESS: &str = "127.0.0.1";
pub const DEFAULT_LISTEN_PORT: u16 = 8080;

#[derive(Debug, Clone, Copy, ValueEnum, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PackageManager {
    #[default]
    Lazy,
    Packer,
    Minimal,
    Other,
}

impl std::fmt::Display for PackageManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Lazy => "lazy",
            Self::Packer => "packer",
            Self::Minimal => "minimal",
            Self::Other => "other",
        };
        write!(f, "{}", s)
    }
}

// Snippets per i gestori di pacchetti (commentati o attivi)
pub const LAZY_COMMENTED: &str = r#"-- [[ Bootstrap Lazy.nvim ]]
-- local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
-- if not vim.loop.fs_stat(lazypath) then
--   vim.fn.system({
--     "git", "clone", "--filter=blob:none",
--     "https://github.com/folke/lazy.nvim.git",
--     "--branch=stable", lazypath
--   })
-- end
-- vim.opt.rtp:prepend(lazypath)
--
-- require("lazy").setup({
--   -- Add your plugins here, e.g.
--   -- { 'catppuccin/nvim', name = 'catppuccin' },
-- })"#;

pub const LAZY_ACTIVE: &str = r#"local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
  vim.fn.system({
    "git", "clone", "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable", lazypath
  })
end
vim.opt.rtp:prepend(lazypath)

require("lazy").setup({
  -- Add your plugins here, e.g.
  -- { 'catppuccin/nvim', name = 'catppuccin' },
})"#;

pub const PACKER_COMMENTED: &str = r#"-- [[ Bootstrap Packer.nvim ]]
-- local fn = vim.fn
-- local install_path = fn.stdpath('data')..'/site/pack/packer/start/packer.nvim'
-- if fn.empty(fn.glob(install_path)) > 0 then
--   fn.system({'git', 'clone', '--depth', '1', 'https://github.com/wbthomason/packer.nvim', install_path})
-- end
-- vim.cmd [[packadd packer.nvim]]
--
-- require('packer').startup(function(use)
--   -- Add your plugins here, e.g.
--   -- use 'wbthomason/packer.nvim'
-- end)"#;

pub const PACKER_ACTIVE: &str = r#"local fn = vim.fn
local install_path = fn.stdpath('data')..'/site/pack/packer/start/packer.nvim'
if fn.empty(fn.glob(install_path)) > 0 then
  fn.system({'git', 'clone', '--depth', '1', 'https://github.com/wbthomason/packer.nvim', install_path})
end
vim.cmd [[packadd packer.nvim]]

require('packer').startup(function(use)
  -- Add your plugins here, e.g.
  -- use 'wbthomason/packer.nvim'
end)"#;

pub const OTHER_COMMENTED: &str =
    "-- [[ Add your plugin manager bootstrap or manual plugin loading here. ]]";
pub const OTHER_ACTIVE: &str =
    "-- Add your plugin manager bootstrap or manual plugin loading here.";

pub fn get_snippet(pkg: PackageManager, no_comments: bool) -> &'static str {
    match (pkg, no_comments) {
        (PackageManager::Lazy, true) => LAZY_ACTIVE,
        (PackageManager::Lazy, false) => LAZY_COMMENTED,
        (PackageManager::Packer, true) => PACKER_ACTIVE,
        (PackageManager::Packer, false) => PACKER_COMMENTED,
        _ if no_comments => OTHER_ACTIVE,
        _ => OTHER_COMMENTED,
    }
}

pub fn get_basic_opts(no_comments: bool) -> String {
    if no_comments {
        r#"vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.tabstop = 4
vim.opt.shiftwidth = 4
vim.opt.expandtab = true"#
            .to_string()
    } else {
        r#"-- Uncomment and adjust the options you need:
-- vim.opt.number = true
-- vim.opt.relativenumber = true
-- vim.opt.tabstop = 4
-- vim.opt.shiftwidth = 4
-- vim.opt.expandtab = true"#
            .to_string()
    }
}

pub fn get_user_content(no_comments: bool) -> String {
    if no_comments {
        r#"-- User-specific module
local M = {}
function M.setup()
  -- Add your custom code here
end
return M"#
            .to_string()
    } else {
        r#"-- User-specific module
-- This file can be loaded via require('user') from init.lua
-- Add your own custom Lua code here."#
            .to_string()
    }
}

pub fn get_standard_config_dir() -> PathBuf {
    #[cfg(windows)]
    {
        std::env::var("LOCALAPPDATA")
            .ok()
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var("USERPROFILE")
                    .ok()
                    .map(|h| PathBuf::from(h).join("AppData").join("Local").join("nvim"))
            })
            .or_else(|| {
                std::env::var("HOME")
                    .ok()
                    .map(|h| PathBuf::from(h).join("AppData").join("Local").join("nvim"))
            })
            .unwrap_or_else(|| PathBuf::from("."))
    }
    #[cfg(not(windows))]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home).join(".config").join("nvim")
    }
}