use napi::bindgen_prelude::{Buffer, Error, Result, Status};
use screenshots::{image::ImageOutputFormat, Screen};
use std::io::Cursor;

pub fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<Buffer> {
  if width == 0 || height == 0 {
    return Err(Error::new(
      Status::InvalidArg,
      "Screenshot region must have a positive width and height".to_string(),
    ));
  }

  let center_x = (i64::from(x) + i64::from(width) / 2)
    .clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32;
  let center_y = (i64::from(y) + i64::from(height) / 2)
    .clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32;
  let screen = Screen::from_point(center_x, center_y).map_err(|error| {
    Error::new(
      Status::GenericFailure,
      format!("Unable to find the display for the screenshot region: {error}"),
    )
  })?;

  let local_x = x.saturating_sub(screen.display_info.x);
  let local_y = y.saturating_sub(screen.display_info.y);
  let image = screen
    .capture_area(local_x, local_y, width, height)
    .map_err(|error| {
      Error::new(
        Status::GenericFailure,
        format!("Native screen capture failed: {error}"),
      )
    })?;

  let mut png = Cursor::new(Vec::new());
  image
    .write_to(&mut png, ImageOutputFormat::Png)
    .map_err(|error| {
      Error::new(
        Status::GenericFailure,
        format!("Unable to encode screenshot as PNG: {error}"),
      )
    })?;

  Ok(Buffer::from(png.into_inner()))
}
